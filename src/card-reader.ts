import styles from './card-reader.css?inline';
import * as db from './db';

interface ImageSource {
  blob: Blob;
  source: 'upload' | 'camera';
}

interface CardData {
  name: string;
  manaCost: string[];
  type: string;
  subtype: string;
  text: string;
  flavor: string;
  power: number | null;
  toughness: number | null;
  imageUrl?: string;
}

type LanguageModelAPI = any; // TODO: Use @types/dom-chromium-ai when available

let instanceCounter = 0;

export class CardReader extends HTMLElement {
  private root: ShadowRoot;
  private fileInput: HTMLInputElement | null = null;
  private video: HTMLVideoElement | null = null;
  private displayCanvas: HTMLCanvasElement | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private currentImage: ImageSource | null = null;
  private mediaStream: MediaStream | null = null;
  private videoCrop: { sx: number; sy: number; sw: number; sh: number } | null = null;
  private instanceId: string;
  private spaceListenerAttached = false;
  private handleKeydown: (event: KeyboardEvent) => void;

  private qs<T extends Element>(selector: string): T | null {
    return this.root.querySelector(selector);
  }

  private announceToScreenReader(message: string) {
    const liveRegion = this.qs<HTMLElement>('[role="status"]');
    if (liveRegion) {
      liveRegion.textContent = message;
      // Clear after a short delay so repeated messages work
      setTimeout(() => {
        if (liveRegion) liveRegion.textContent = '';
      }, 1000);
    }
  }

  private setButtonLoading(button: HTMLButtonElement, loading: boolean) {
    const textSpan = button.querySelector('.btn-text');
    const spinner = button.querySelector('.spinner') as HTMLElement;
    
    button.disabled = loading;
    if (textSpan) textSpan.textContent = loading && button.classList.contains('process-btn') ? 'Processing...' : textSpan.textContent;
    if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.instanceId = `card-reader-${++instanceCounter}`;
    this.handleKeydown = (event: KeyboardEvent) => {
      if (!this.mediaStream) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button') || target?.isContentEditable) return;
      if (event.code === 'Space') {
        event.preventDefault();
        this.capturePhoto();
      }
    };
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
  }

  private render() {
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(styles);
    this.root.adoptedStyleSheets = [styleSheet];

    const container = document.createElement('div');
    container.className = 'card-reader-container';
    container.innerHTML = `
      <div class="header-bar">
        <h2>Card Scanner</h2>
        <button class="close-btn" type="button" style="display: none;" aria-label="Close this reader">×</button>
      </div>
      <div class="content-wrapper">
        <div class="image-section">
          <h3>Add Card Image</h3>
          <div class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
          <div class="camera-actions">
            <button class="camera-toggle-btn" type="button">Start Camera</button>
            <button class="upload-btn" type="button">Upload Image</button>
          </div>
          <div class="canvas-wrapper">
            <canvas class="camera-canvas"></canvas>
          </div>
          <div class="image-actions">
            <button class="process-btn" type="button" style="display: none;">
              <span class="btn-text">Extract Card Data</span>
              <span class="spinner" style="display: none;"></span>
            </button>
          </div>
        </div>
        <div class="form-section">
          <h3>Card Details</h3>
          <form class="card-data-form">
            <div class="form-group">
              <label for="${this.instanceId}-name">
                <span class="label-text">Card Name <abbr title="required" class="required">*</abbr></span>
                <input type="text" id="${this.instanceId}-name" class="input-name" value="" required aria-required="true" />
              </label>
            </div>
            <div class="form-group">
              <label for="${this.instanceId}-mana">
                <span class="label-text">Mana Cost (comma separated)</span>
                <input type="text" id="${this.instanceId}-mana" class="input-mana" value="" />
              </label>
            </div>
            <div class="form-group">
              <label for="${this.instanceId}-type">
                <span class="label-text">Type <abbr title="required" class="required">*</abbr></span>
                <input type="text" id="${this.instanceId}-type" class="input-type" value="" required aria-required="true" />
              </label>
            </div>
            <div class="form-group">
              <label for="${this.instanceId}-subtype">
                <span class="label-text">Subtype</span>
                <input type="text" id="${this.instanceId}-subtype" class="input-subtype" value="" />
              </label>
            </div>
            <div class="form-group">
              <label for="${this.instanceId}-text">
                <span class="label-text">Card Text</span>
                <textarea id="${this.instanceId}-text" class="input-text" rows="4"></textarea>
              </label>
            </div>
            <div class="form-group">
              <label for="${this.instanceId}-flavor">
                <span class="label-text">Flavor Text</span>
                <textarea id="${this.instanceId}-flavor" class="input-flavor flavor-text" rows="3"></textarea>
              </label>
            </div>
            <div class="form-group form-group-grid">
              <label for="${this.instanceId}-power">
                <span class="label-text">Power</span>
                <input type="number" id="${this.instanceId}-power" class="input-power" />
              </label>
              <label for="${this.instanceId}-toughness">
                <span class="label-text">Toughness</span>
                <input type="number" id="${this.instanceId}-toughness" class="input-toughness" />
              </label>
            </div>
            <button type="submit" class="save-btn">
              <span class="btn-text">Save Card</span>
              <span class="spinner" style="display: none;"></span>
            </button>
            <div class="form-status" aria-live="polite"></div>
        </div>
      </div>
    `;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/jpeg,image/png,image/webp,image/bmp';
    this.fileInput.style.display = 'none';
    container.appendChild(this.fileInput);

    const canvas = container.querySelector('.camera-canvas') as HTMLCanvasElement | null;
    if (canvas) {
      canvas.width = 250;
      canvas.height = 350;
      this.displayCanvas = canvas;
    }

    this.root.appendChild(container);
  }

  private attachEventListeners() {
    this.qs<HTMLButtonElement>('.upload-btn')?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e as Event));
    this.qs<HTMLButtonElement>('.camera-toggle-btn')?.addEventListener('click', () => this.toggleCamera());
    this.qs<HTMLButtonElement>('.process-btn')?.addEventListener('click', () => this.processCard());
    this.qs<HTMLButtonElement>('.close-btn')?.addEventListener('click', () => this.closeReader());
    this.qs<HTMLFormElement>('.card-data-form')?.addEventListener('submit', (e) => this.onSaveCard(e));
    this.updateCloseButtonVisibility();
  }

  private updateCloseButtonVisibility() {
    const closeBtn = this.qs<HTMLButtonElement>('.close-btn');
    if (!closeBtn) return;

    const readerList = document.getElementById('readerList');
    if (!readerList) return;

    const readerCount = readerList.querySelectorAll('card-reader').length;
    closeBtn.style.display = readerCount > 1 ? 'block' : 'none';
  }

  private closeReader() {
    this.stopCamera();
    
    // Return focus to add button or another reader
    const addBtn = document.getElementById('addCardReaderBtn');
    if (addBtn) {
      addBtn.focus();
    }
    
    this.remove();
    
    // Update close button visibility on all remaining readers
    const readerList = document.getElementById('readerList');
    if (readerList) {
      readerList.querySelectorAll('card-reader').forEach((reader) => {
        (reader as CardReader).updateCloseButtonsOnAllReaders();
      });
    }
  }

  public updateCloseButtonsOnAllReaders() {
    this.updateCloseButtonVisibility();
  }

  private setStatus(message: string, type: 'info' | 'success' | 'error') {
    const status = this.qs<HTMLElement>('.form-status');
    if (!status) return;
    status.textContent = message;
    status.className = `form-status status-${type}`;
  }

  private getFormInputs() {
    return {
      name: this.qs<HTMLInputElement>('.input-name'),
      mana: this.qs<HTMLInputElement>('.input-mana'),
      type: this.qs<HTMLInputElement>('.input-type'),
      subtype: this.qs<HTMLInputElement>('.input-subtype'),
      text: this.qs<HTMLTextAreaElement>('.input-text'),
      flavor: this.qs<HTMLTextAreaElement>('.input-flavor'),
      power: this.qs<HTMLInputElement>('.input-power'),
      toughness: this.qs<HTMLInputElement>('.input-toughness'),
    };
  }

  private getDisplayCanvas(): HTMLCanvasElement | null {
    if (this.displayCanvas && this.displayCanvas.isConnected) {
      return this.displayCanvas;
    }

    const canvas = this.qs<HTMLCanvasElement>('.camera-canvas');
    if (canvas) {
      if (!canvas.width || !canvas.height) {
        canvas.width = 250;
        canvas.height = 350;
      }
      this.displayCanvas = canvas;
    }

    return canvas;
  }

  private populateForm(cardData: CardData) {
    const inputs = this.getFormInputs();
    inputs.name && (inputs.name.value = cardData.name);
    inputs.mana && (inputs.mana.value = cardData.manaCost.join(', '));
    inputs.type && (inputs.type.value = cardData.type);
    inputs.subtype && (inputs.subtype.value = cardData.subtype);
    inputs.text && (inputs.text.value = cardData.text);
    inputs.flavor && (inputs.flavor.value = cardData.flavor);
    inputs.power && (inputs.power.value = cardData.power !== null ? String(cardData.power) : '');
    inputs.toughness && (inputs.toughness.value = cardData.toughness !== null ? String(cardData.toughness) : '');
  }

  private renderPreview(blob: Blob | null) {
    const canvas = this.getDisplayCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!blob) return;

    const img = new Image();
    img.onload = () => {
      const targetRatio = canvas.width / canvas.height;
      const imgRatio = img.width / img.height;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;

      if (imgRatio > targetRatio) {
        sw = img.height * targetRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / targetRatio;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    };

    img.src = URL.createObjectURL(blob);
  }

  private updateButtonStates() {
    const cameraBtn = this.qs<HTMLButtonElement>('.camera-toggle-btn');
    const processBtn = this.qs<HTMLButtonElement>('.process-btn');
    const canvas = this.qs<HTMLCanvasElement>('.camera-canvas');

    const isActive = Boolean(this.mediaStream);
    const hasImage = Boolean(this.currentImage);

    // Update camera button text and announce state
    if (cameraBtn) {
      const newText = isActive ? 'Take Photo' : 'Start Camera';
      if (cameraBtn.textContent !== newText) {
        cameraBtn.textContent = newText;
        if (isActive) {
          this.announceToScreenReader('Camera started. Press spacebar to take photo.');
        }
      }
    }

    // Update canvas mirror effect
    if (canvas) {
      canvas.classList.toggle('camera-active', isActive);
    }

    // Show/hide process button
    if (processBtn) {
      processBtn.style.display = hasImage ? 'block' : 'none';
    }
  }

  private handleFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files?.length) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (this.mediaStream) {
      this.stopCamera();
    }

    this.currentImage = { blob: file, source: 'upload' };
    this.renderPreview(file);
    this.updateButtonStates();
    this.setStatus('', 'info');
  }

  private async toggleCamera() {
    const canvas = this.getDisplayCanvas();
    if (!canvas) return;

    if (this.mediaStream) {
      // Take photo if camera is active
      this.capturePhoto();
    } else {
      // Start camera
      try {
        await this.startCamera(canvas);
        this.updateButtonStates();
      } catch (error) {
        console.error('Camera error:', error);
        alert('Unable to access camera');
      }
    }
  }

  private async startCamera(displayCanvas: HTMLCanvasElement) {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    this.video = document.createElement('video');
    this.video.srcObject = this.mediaStream;
    this.video.play();

    // Wait for video dimensions
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (this.video?.videoWidth) resolve();
        else requestAnimationFrame(checkReady);
      };
      checkReady();
    });

    // Setup canvases
    displayCanvas.width = 250;
    displayCanvas.height = 350;

    const video = this.video;
    if (!video) {
      this.stopCamera();
      return;
    }

    this.captureCanvas = document.createElement('canvas');
    this.captureCanvas.width = video.videoWidth || displayCanvas.width;
    this.captureCanvas.height = video.videoHeight || displayCanvas.height;
    this.displayCanvas = displayCanvas;
    this.addSpacebarShortcut();

    const displayCtx = displayCanvas.getContext('2d');
    const captureCtx = this.captureCanvas.getContext('2d');
    if (!displayCtx || !captureCtx) {
      this.stopCamera();
      return;
    }

    const targetRatio = displayCanvas.width / displayCanvas.height;

    const drawFrame = () => {
      if (!this.mediaStream || !this.video) return;
      const liveVideo = this.video;
      if (!liveVideo) return;

      // Calculate crop to match aspect ratio
      const videoRatio = liveVideo.videoWidth / liveVideo.videoHeight;
      let { sx, sy, sw, sh } = { sx: 0, sy: 0, sw: liveVideo.videoWidth, sh: liveVideo.videoHeight };

      if (videoRatio > targetRatio) {
        sw = liveVideo.videoHeight * targetRatio;
        sx = (liveVideo.videoWidth - sw) / 2;
      } else {
        sh = liveVideo.videoWidth / targetRatio;
        sy = (liveVideo.videoHeight - sh) / 2;
      }

      this.videoCrop = { sx, sy, sw, sh };
      displayCtx.drawImage(liveVideo, sx, sy, sw, sh, 0, 0, displayCanvas.width, displayCanvas.height);
      captureCtx.drawImage(liveVideo, 0, 0, liveVideo.videoWidth, liveVideo.videoHeight);
      requestAnimationFrame(drawFrame);
    };

    drawFrame();
  }

  private stopCamera() {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.video?.pause();
    this.video = null;
    this.removeSpacebarShortcut();
  }

  private capturePhoto() {
    if (!this.captureCanvas || !this.videoCrop || !this.video) return;

    const { sx, sy, sw, sh } = this.videoCrop;
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = sw;
    croppedCanvas.height = sh;

    const ctx = croppedCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, sw, sh);

    croppedCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        this.currentImage = { blob, source: 'camera' };
        this.stopCamera();
        this.renderPreview(blob);
        this.updateButtonStates();
        this.setStatus('', 'info');
      },
      'image/jpeg',
      0.95
    );
  }

  private addSpacebarShortcut() {
    if (this.spaceListenerAttached) return;
    document.addEventListener('keydown', this.handleKeydown);
    this.spaceListenerAttached = true;
  }

  private removeSpacebarShortcut() {
    if (!this.spaceListenerAttached) return;
    document.removeEventListener('keydown', this.handleKeydown);
    this.spaceListenerAttached = false;
  }

  disconnectedCallback() {
    this.stopCamera();
  }

  private async processCard() {
    if (!this.currentImage) {
      this.setStatus('Add an image to extract card data.', 'error');
      return;
    }

    const btn = this.qs<HTMLButtonElement>('.process-btn');
    if (!btn) return;

    this.setButtonLoading(btn, true);
    this.setStatus('Processing image...', 'info');

    try {
      const languageModel = (self as { LanguageModel?: LanguageModelAPI }).LanguageModel;
      if (!languageModel) throw new Error('LanguageModel API not available');

      const session = await languageModel.create({
        expectedInputs: [
          { type: 'text', languages: ['en'] },
          { type: 'image' },
        ],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });

      const cardDataSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          manaCost: { type: 'array', items: { type: 'string' } },
          type: { type: 'string' },
          subtype: { type: 'string' },
          text: { type: 'string' },
          flavor: { type: 'string' },
          power: { type: ['number', 'null'] },
          toughness: { type: ['number', 'null'] },
        },
        required: ['name', 'manaCost', 'type', 'subtype', 'text', 'flavor'],
      };

      const cardResult = await session.prompt(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                value: `Extract all information from this Magic: The Gathering card and return ONLY valid JSON with this schema:
{
  "name": "Card Name",
  "manaCost": ["2", "{U}", "{U}"],
  "type": "Creature",
  "subtype": "Human Wizard",
  "text": "Card abilities text",
  "flavor": "Flavor text",
  "power": 2,
  "toughness": 3
}

Use strings for every mana symbol, including generic mana (e.g., "2") and colored symbols like "{U}", "{W}", "{B}", "{R}", "{G}".
If the card is not a creature, set power and toughness to null.`,
              },
              { type: 'image', value: this.currentImage.blob },
            ],
          },
        ],
        { responseConstraint: cardDataSchema }
      );

      const parsed = typeof cardResult === 'string' ? JSON.parse(cardResult) : cardResult;
      const cardData: CardData = { ...parsed, manaCost: this.normalizeManaCost(parsed.manaCost) };
      this.populateForm(cardData);
      this.setStatus('Extracted data filled in. Review and save.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus(`Error: ${message}`, 'error');
      console.error('Card processing error:', error);
    } finally {
      this.setButtonLoading(btn, false);
      const textSpan = btn.querySelector('.btn-text');
      if (textSpan) textSpan.textContent = 'Extract Card Data';
    }
  }

  private normalizeManaCost(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean) : [];
  }

  private async onSaveCard(e: Event) {
    e.preventDefault();
    const inputs = this.getFormInputs();

    if (!inputs.name?.value || !inputs.type?.value) {
      this.setStatus('Name and Type are required.', 'error');
      inputs.name?.focus();
      return;
    }

    const saveBtn = this.qs<HTMLButtonElement>('.save-btn');
    if (!saveBtn) return;

    this.setButtonLoading(saveBtn, true);

    try {
      const manaCost = (inputs.mana?.value || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      const cardId = await db.saveCard({
        name: inputs.name.value,
        manaCost,
        type: inputs.type.value,
        subtype: inputs.subtype?.value || '',
        text: inputs.text?.value || '',
        flavor: inputs.flavor?.value || '',
        power: inputs.power?.value ? parseInt(inputs.power.value, 10) : null,
        toughness: inputs.toughness?.value ? parseInt(inputs.toughness.value, 10) : null,
        imageBlob: this.currentImage?.blob || new Blob(),
        createdAt: Date.now(),
      });

      this.setStatus(`✓ Card saved! (ID: ${cardId})`, 'success');
      this.dispatchEvent(new CustomEvent('cardSaved', { detail: { id: cardId, name: inputs.name.value } }));
    } catch (error) {
      console.error('Failed to save card:', error);
      
      // Check for quota exceeded error
      if (error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('quota'))) {
        this.setStatus('Storage quota exceeded. Please delete some cards from your library.', 'error');
      } else {
        this.setStatus('Failed to save card. Please try again.', 'error');
      }
    } finally {
      this.setButtonLoading(saveBtn, false);
    }
  }
}

customElements.define('card-reader', CardReader);
