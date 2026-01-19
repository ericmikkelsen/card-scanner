import styles from './card-reader.css?inline';

interface ImageSource {
  blob: Blob;
  source: 'upload' | 'camera';
}

type LanguageModelAPI = any; // TODO: Use @types/dom-chromium-ai when available

export class CardReader extends HTMLElement {
  private shadowRoot!: ShadowRoot;
  private fileInput: HTMLInputElement | null = null;
  private video: HTMLVideoElement | null = null;
  private displayCanvas: HTMLCanvasElement | null = null;
  private captureCanvas: HTMLCanvasElement | null = null;
  private currentImage: ImageSource | null = null;
  private mediaStream: MediaStream | null = null;

  constructor() {
    super();
    this.shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
  }

  private render() {
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(styles);
    this.shadowRoot.adoptedStyleSheets = [styleSheet];

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

    this.shadowRoot.appendChild(container);
  }

  private attachEventListeners() {
    const query = (selector: string) => this.shadowRoot.querySelector(selector) as HTMLElement;

    query('.upload-btn')?.addEventListener('click', () => this.fileInput?.click());
    this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e as Event));
    query('.camera-toggle-btn')?.addEventListener('click', () => this.toggleCamera());
    query('.take-photo-btn')?.addEventListener('click', () => this.capturePhoto());
    query('.process-btn')?.addEventListener('click', () => this.processCard());
    query('.back-btn')?.addEventListener('click', () => this.resetPhase());
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
    const btn = this.shadowRoot.querySelector('.camera-toggle-btn') as HTMLButtonElement;
    const canvas = this.shadowRoot.querySelector('.camera-canvas') as HTMLCanvasElement;
    const captureBtn = this.shadowRoot.querySelector('.take-photo-btn') as HTMLButtonElement;

    if (this.mediaStream) {
      this.stopCamera();
      btn.textContent = 'Turn On Camera';
      canvas.style.display = 'none';
      captureBtn.style.display = 'none';
    } else {
      try {
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
    await new Promise<void>(resolve => {
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

      displayCtx.drawImage(this.video, sx, sy, sw, sh, 0, 0, displayCanvas.width, displayCanvas.height);
      captureCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight);
      requestAnimationFrame(drawFrame);
    };

    drawFrame();
  }

  private stopCamera() {
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.mediaStream = null;
    this.video?.pause();
    this.video = null;
  }

  private capturePhoto() {
    if (!this.captureCanvas) return;

    this.captureCanvas.toBlob((blob) => {
      if (!blob) return;

      this.currentImage = { blob, source: 'camera' };
      this.stopCamera();

      // Reset camera UI
      const btn = this.shadowRoot.querySelector('.camera-toggle-btn') as HTMLButtonElement;
      const captureBtn = this.shadowRoot.querySelector('.take-photo-btn') as HTMLButtonElement;
      btn.textContent = 'Turn On Camera';
      captureBtn.style.display = 'none';
      (this.shadowRoot.querySelector('.camera-canvas') as HTMLCanvasElement).style.display = 'none';

      this.switchPhase('process');
    }, 'image/jpeg', 0.95);
  }

  private switchPhase(phase: 'add' | 'process') {
    const addPhase = this.shadowRoot.querySelector('.phase-add-image') as HTMLElement;
    const processPhase = this.shadowRoot.querySelector('.phase-process-photo') as HTMLElement;

    if (phase === 'process') {
      addPhase.style.display = 'none';
      processPhase.style.display = 'block';

      if (this.currentImage) {
        const preview = processPhase.querySelector('.photo-preview') as HTMLElement;
        const url = URL.createObjectURL(this.currentImage.blob);
        preview.innerHTML = `<img src="${url}" alt="Card preview" class="preview-image">`;
      }
    } else {
      addPhase.style.display = 'block';
      processPhase.style.display = 'none';
    }
  }

  private resetPhase() {
    (this.shadowRoot.querySelector('.extracted-data') as HTMLElement).innerHTML = '';
    this.currentImage = null;
    this.switchPhase('add');
  }

  private async processCard() {
    if (!this.currentImage) return;

    const btn = this.shadowRoot.querySelector('.process-btn') as HTMLButtonElement;
    const output = this.shadowRoot.querySelector('.extracted-data') as HTMLElement;

    btn.disabled = true;
    output.textContent = 'Processing...';

    try {
      const languageModel = (self as any).LanguageModel as LanguageModelAPI;
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

      const result = await session.prompt([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              value: `Extract all information from this Magic: The Gathering card:
- Card name
- Mana cost
- Card type and subtype
- Card text/abilities
- Power and toughness (if creature)
- Rarity (if visible)

Return as JSON with these fields.`,
            },
            {
              type: 'image',
              value: this.currentImage.blob,
            },
          ],
        },
      ]);

      output.innerHTML = `<div class="extracted-text">${result}</div>`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      output.innerHTML = `<div class="error">Error: ${message}</div>`;
      console.error('Card processing error:', error);
    } finally {
      btn.disabled = false;
    }
  }
}

customElements.define('card-reader', CardReader);
