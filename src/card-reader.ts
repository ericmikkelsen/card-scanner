import styles from './card-reader.css?inline';

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
}

type LanguageModelAPI = any; // TODO: Use @types/dom-chromium-ai when available

export class CardReader extends HTMLElement {
  private root: ShadowRoot;
  private fileInput: HTMLInputElement | null = null;
  private video: HTMLVideoElement | null = null;
  private displayCanvas: HTMLCanvasElement | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private currentImage: ImageSource | null = null;
  private mediaStream: MediaStream | null = null;
  private videoCrop: { sx: number; sy: number; sw: number; sh: number } | null = null;

  private qs<T extends Element>(selector: string): T | null {
    return this.root.querySelector(selector);
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
  }

  private render() {
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(styles);
    this.root.adoptedStyleSheets = [styleSheet];

    // Get data attributes for dynamic heading levels and text
    const headingLevel = parseInt(this.getAttribute('data-level') || '2', 10);
    const headingText = this.getAttribute('data-heading') || 'card scanner';
    const subheadingLevel = headingLevel + 1;

    // Clamp heading levels to valid range (1-6)
    const mainLevel = Math.max(1, Math.min(6, headingLevel));
    const subLevel = Math.max(1, Math.min(6, subheadingLevel));

    const container = document.createElement('div');
    container.className = 'card-reader-container';
    container.innerHTML = `
      <h${mainLevel}>${this.escapeHtml(headingText)}</h${mainLevel}>
      <div class="phase phase-add-image">
        <h${subLevel}>Add Card Image</h${subLevel}>
        <div class="image-options">
          <div class="option">
            <h${subLevel + 1}>Upload Image</h${subLevel + 1}>
            <button class="upload-btn" type="button">Choose Image</button>
            <p class="option-description">Upload JPG, PNG, WebP, or Bitmap</p>
          </div>
          <div class="divider">or</div>
          <div class="option">
            <h${subLevel + 1}>Take Picture</h${subLevel + 1}>
            <button class="camera-toggle-btn" type="button">Turn On Camera</button>
            <canvas class="camera-canvas" style="display: none;"></canvas>
            <button class="take-photo-btn" type="button" style="display: none;">Take Photo</button>
          </div>
        </div>
      </div>
      <div class="phase phase-process-photo" style="display: none;">
        <h${subLevel}>Process Card</h${subLevel}>
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

    const manaCostValue = this.normalizeManaCost(cardData.manaCost).join(', ');

    output.innerHTML = `
      <form class="card-data-form">
        <div class="form-group">
          <label for="card-name">Card Name</label>
          <input type="text" id="card-name" value="${this.escapeHtml(cardData.name)}" readonly />
        </div>
        <div class="form-group">
          <label for="card-mana">Mana Cost (comma separated)</label>
          <input type="text" id="card-mana" value="${this.escapeHtml(manaCostValue)}" />
        </div>
        <div class="form-group">
          <label for="card-type">Type</label>
          <input type="text" id="card-type" value="${this.escapeHtml(cardData.type)}" />
        </div>
        <div class="form-group">
          <label for="card-subtype">Subtype</label>
          <input type="text" id="card-subtype" value="${this.escapeHtml(cardData.subtype)}" />
        </div>
        <div class="form-group">
          <label for="card-text">Card Text</label>
          <textarea id="card-text" rows="4">${this.escapeHtml(cardData.text)}</textarea>
        </div>
        <div class="form-group">
          <label for="card-flavor">Flavor Text</label>
          <textarea id="card-flavor" rows="3" class="flavor-text">${this.escapeHtml(cardData.flavor)}</textarea>
        </div>
        <div class="form-group form-group-grid">
          <div>
            <label for="card-power">Power</label>
            <input type="number" id="card-power" value="${cardData.power !== null ? cardData.power : ''}" />
          </div>
          <div>
            <label for="card-toughness">Toughness</label>
            <input type="number" id="card-toughness" value="${cardData.toughness !== null ? cardData.toughness : ''}" />
          </div>
        </div>
        <button type="button" class="save-btn">Save Card</button>
      </form>
    `;
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
}

customElements.define('card-reader', CardReader);
