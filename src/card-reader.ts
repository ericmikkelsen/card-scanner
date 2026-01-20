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
  private currentCardData: CardData | null = null;
  private mediaStream: MediaStream | null = null;
  private videoCrop: { sx: number; sy: number; sw: number; sh: number } | null = null;
  private instanceId: string;

  private qs<T extends Element>(selector: string): T | null {
    return this.root.querySelector(selector);
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.instanceId = `card-reader-${++instanceCounter}`;
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
      <div class="phase phase-add-image">
        <h2>Add Card Image</h2>
        <div class="image-options">
          <div class="option">
            <h3>Upload Image</h3>
            <button class="upload-btn" type="button">Choose Image</button>
            <p class="option-description">Upload JPG, PNG, WebP, or Bitmap</p>
          </div>
          <div class="divider">or</div>
          <div class="option">
            <h3>Take Picture</h3>
            <button class="camera-toggle-btn" type="button">Turn On Camera</button>
            <canvas class="camera-canvas" style="display: none;"></canvas>
            <button class="take-photo-btn" type="button" style="display: none;">Take Photo</button>
          </div>
        </div>
      </div>
      <div class="phase phase-process-photo" style="display: none;">
        <h2>Process Card</h2>
        <div class="photo-preview"></div>
        <button class="process-btn" type="button">Extract Card Data</button>
        <button class="back-btn" type="button">Back</button>
        <div class="extracted-data"></div>
      </div>
    `;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/jpeg,image/png,image/webp,image/bmp';
    this.fileInput.style.display = 'none';
    container.appendChild(this.fileInput);

    this.root.appendChild(container);
  }

  private attachEventListeners() {
    this.qs<HTMLButtonElement>('.upload-btn')?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e as Event));
    this.qs<HTMLButtonElement>('.camera-toggle-btn')?.addEventListener('click', () => this.toggleCamera());
    this.qs<HTMLButtonElement>('.take-photo-btn')?.addEventListener('click', () => this.capturePhoto());
    this.qs<HTMLButtonElement>('.process-btn')?.addEventListener('click', () => this.processCard());
    this.qs<HTMLButtonElement>('.back-btn')?.addEventListener('click', () => this.resetPhase());
  }

  private handleFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files?.length) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    this.currentImage = { blob: file, source: 'upload' };
    this.switchPhase('process');
  }

  private async toggleCamera() {
    const btn = this.qs<HTMLButtonElement>('.camera-toggle-btn');
    const canvas = this.qs<HTMLCanvasElement>('.camera-canvas');
    const captureBtn = this.qs<HTMLButtonElement>('.take-photo-btn');

    if (this.mediaStream) {
      this.stopCamera();
      if (btn) btn.textContent = 'Turn On Camera';
      if (canvas) canvas.style.display = 'none';
      if (captureBtn) captureBtn.style.display = 'none';
    } else {
      try {
        if (!canvas || !captureBtn || !btn) return;
        await this.startCamera(canvas);
        btn.textContent = 'Turn Off Camera';
        canvas.style.display = 'block';
        captureBtn.style.display = 'block';
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
      const check = () => {
        if (this.video?.videoWidth) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });

    // Setup canvases
    displayCanvas.width = 250;
    displayCanvas.height = 350;

    this.captureCanvas = document.createElement('canvas');
    this.captureCanvas.width = this.video.videoWidth;
    this.captureCanvas.height = this.video.videoHeight;

    this.displayCanvas = displayCanvas;

    // Start frame drawing
    const displayCtx = displayCanvas.getContext('2d')!;
    const captureCtx = this.captureCanvas.getContext('2d')!;
    const targetRatio = displayCanvas.width / displayCanvas.height;

    const drawFrame = () => {
      if (!this.mediaStream || !this.video) return;

      const videoRatio = this.video.videoWidth / this.video.videoHeight;
      let sx = 0, sy = 0, sw = this.video.videoWidth, sh = this.video.videoHeight;

      // Crop video to match display canvas aspect ratio
      if (videoRatio > targetRatio) {
        sw = this.video.videoHeight * targetRatio;
        sx = (this.video.videoWidth - sw) / 2;
      } else {
        sh = this.video.videoWidth / targetRatio;
        sy = (this.video.videoHeight - sh) / 2;
      }

      // Store crop for use when capturing photo
      this.videoCrop = { sx, sy, sw, sh };

      displayCtx.drawImage(this.video, sx, sy, sw, sh, 0, 0, displayCanvas.width, displayCanvas.height);
      captureCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight);
      requestAnimationFrame(drawFrame);
    };

    drawFrame();
  }

  private stopCamera() {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.video?.pause();
    this.video = null;
  }

  private capturePhoto() {
    if (!this.captureCanvas || !this.videoCrop) return;

    const crop = this.videoCrop;
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = crop.sw;
    croppedCanvas.height = crop.sh;

    const ctx = croppedCanvas.getContext('2d')!;
    ctx.drawImage(this.video!, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);

    croppedCanvas.toBlob((blob) => {
      if (!blob) return;

      this.currentImage = { blob, source: 'camera' };
      this.stopCamera();

      // Reset camera UI
      const btn = this.qs<HTMLButtonElement>('.camera-toggle-btn');
      const captureBtn = this.qs<HTMLButtonElement>('.take-photo-btn');
      const canvasEl = this.qs<HTMLCanvasElement>('.camera-canvas');
      if (btn) btn.textContent = 'Turn On Camera';
      if (captureBtn) captureBtn.style.display = 'none';
      if (canvasEl) canvasEl.style.display = 'none';

      this.switchPhase('process');
    }, 'image/jpeg', 0.95);
  }

  private switchPhase(phase: 'add' | 'process') {
    const addPhase = this.qs<HTMLElement>('.phase-add-image');
    const processPhase = this.qs<HTMLElement>('.phase-process-photo');
    if (!addPhase || !processPhase) return;

    if (phase === 'process') {
      addPhase.style.display = 'none';
      processPhase.style.display = 'block';

      if (this.currentImage && processPhase) {
        const preview = processPhase.querySelector('.photo-preview') as HTMLElement;
        const url = URL.createObjectURL(this.currentImage.blob);
        preview.innerHTML = `<img src="${url}" alt="Card preview" class="preview-image">`;
      }
    } else {
      if (addPhase) addPhase.style.display = 'block';
      if (processPhase) processPhase.style.display = 'none';
    }
  }

  private resetPhase() {
    this.qs<HTMLElement>('.extracted-data')?.replaceChildren();
    this.currentImage = null;
    this.switchPhase('add');
  }

  private async processCard() {
    if (!this.currentImage) return;

    const btn = this.qs<HTMLButtonElement>('.process-btn');
    const output = this.qs<HTMLElement>('.extracted-data');

    if (!btn || !output) return;

    btn.disabled = true;
    output.textContent = 'Processing...';

    try {
      const languageModel = (self as { LanguageModel?: LanguageModelAPI }).LanguageModel;
      if (!languageModel) {
        throw new Error('LanguageModel API not available');
      }

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
          manaCost: {
            type: 'array',
            items: { type: 'string' },
          },
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
              {
                type: 'image',
                value: this.currentImage.blob,
              },
            ],
          },
        ],
        { responseConstraint: cardDataSchema }
      );

      const parsed = typeof cardResult === 'string' ? JSON.parse(cardResult) : cardResult;
      const cardData: CardData = { ...parsed, manaCost: this.normalizeManaCost(parsed.manaCost) };
      this.renderCardDataForm(cardData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      output.innerHTML = `<div class="error">Error: ${message}</div>`;
      console.error('Card processing error:', error);
    } finally {
      btn.disabled = false;
    }
  }

  private renderCardDataForm(cardData: CardData) {
    const output = this.qs<HTMLElement>('.extracted-data');
    if (!output) return;

    this.currentCardData = cardData;
    const manaCostValue = this.normalizeManaCost(cardData.manaCost).join(', ');

    output.innerHTML = `
      <form class="card-data-form">
        <div class="form-group">
          <label for="${this.instanceId}-name">Card Name</label>
          <input type="text" id="${this.instanceId}-name" class="input-name" value="${this.escapeHtml(cardData.name)}" readonly />
        </div>
        <div class="form-group">
          <label for="${this.instanceId}-mana">Mana Cost (comma separated)</label>
          <input type="text" id="${this.instanceId}-mana" class="input-mana" value="${this.escapeHtml(manaCostValue)}" />
        </div>
        <div class="form-group">
          <label for="${this.instanceId}-type">Type</label>
          <input type="text" id="${this.instanceId}-type" class="input-type" value="${this.escapeHtml(cardData.type)}" />
        </div>
        <div class="form-group">
          <label for="${this.instanceId}-subtype">Subtype</label>
          <input type="text" id="${this.instanceId}-subtype" class="input-subtype" value="${this.escapeHtml(cardData.subtype)}" />
        </div>
        <div class="form-group">
          <label for="${this.instanceId}-text">Card Text</label>
          <textarea id="${this.instanceId}-text" class="input-text" rows="4">${this.escapeHtml(cardData.text)}</textarea>
        </div>
        <div class="form-group">
          <label for="${this.instanceId}-flavor">Flavor Text</label>
          <textarea id="${this.instanceId}-flavor" class="input-flavor flavor-text" rows="3">${this.escapeHtml(cardData.flavor)}</textarea>
        </div>
        <div class="form-group form-group-grid">
          <div>
            <label for="${this.instanceId}-power">Power</label>
            <input type="number" id="${this.instanceId}-power" class="input-power" value="${cardData.power !== null ? cardData.power : ''}" />
          </div>
          <div>
            <label for="${this.instanceId}-toughness">Toughness</label>
            <input type="number" id="${this.instanceId}-toughness" class="input-toughness" value="${cardData.toughness !== null ? cardData.toughness : ''}" />
          </div>
        </div>
        <button type="submit" class="save-btn">Save Card</button>
      </form>
    `;

    const form = output.querySelector('.card-data-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => this.onSaveCard(e, cardData, form));
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private normalizeManaCost(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }

  private async onSaveCard(e: Event, cardData: CardData, form: HTMLFormElement) {
    e.preventDefault();

    try {
      // Collect form values
      const manaCostInput = form.querySelector('.input-mana') as HTMLInputElement;
      const typeInput = form.querySelector('.input-type') as HTMLInputElement;
      const subtypeInput = form.querySelector('.input-subtype') as HTMLInputElement;
      const textInput = form.querySelector('.input-text') as HTMLTextAreaElement;
      const flavorInput = form.querySelector('.input-flavor') as HTMLTextAreaElement;
      const powerInput = form.querySelector('.input-power') as HTMLInputElement;
      const toughnessInput = form.querySelector('.input-toughness') as HTMLInputElement;

      if (!manaCostInput || !typeInput || !subtypeInput || !textInput || !flavorInput) return;

      // Parse mana cost
      const manaCost = manaCostInput.value
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0);

      // Create save card data
      const saveData = {
        name: cardData.name,
        manaCost,
        type: typeInput.value,
        subtype: subtypeInput.value,
        text: textInput.value,
        flavor: flavorInput.value,
        power: powerInput.value ? parseInt(powerInput.value, 10) : null,
        toughness: toughnessInput.value ? parseInt(toughnessInput.value, 10) : null,
        imageBlob: this.currentImage?.blob || new Blob(),
        createdAt: Date.now(),
      };

      // Save to IndexDB
      const cardId = await db.saveCard(saveData);
      console.log('Card saved:', cardId);

      // Show success feedback
      const output = this.qs<HTMLElement>('.extracted-data');
      if (output) {
        output.innerHTML = `
          <div class="save-success">
            <h3>✓ Card saved!</h3>
            <p>${cardData.name}</p>
            <div class="success-actions">
              <button type="button" class="scan-another-btn">Scan Another</button>
              <a href="/library/" class="view-library-link">View Library</a>
            </div>
          </div>
        `;

        const scanBtn = output.querySelector('.scan-another-btn') as HTMLButtonElement;
        if (scanBtn) {
          scanBtn.addEventListener('click', () => this.resetPhase());
        }
      }

      // Emit custom event
      this.dispatchEvent(new CustomEvent('cardSaved', { detail: { id: cardId, name: cardData.name } }));
    } catch (error) {
      console.error('Failed to save card:', error);
      alert('Failed to save card. Please try again.');
    }
  }
}

customElements.define('card-reader', CardReader);
