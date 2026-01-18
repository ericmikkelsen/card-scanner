import styles from './card-reader.css?inline';

export class CardReader extends HTMLElement {
  private fileInput: HTMLInputElement | null = null;
  private previewContainer: HTMLDivElement | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  private render() {
    if (!this.shadowRoot) return;

    // Add styles
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(styles);
    this.shadowRoot.adoptedStyleSheets = [styleSheet];

    // Create structure
    const container = document.createElement('div');
    container.className = 'card-reader-container';

    const uploadArea = document.createElement('div');
    uploadArea.className = 'upload-area';
    uploadArea.setAttribute('role', 'button');
    uploadArea.setAttribute('tabindex', '0');

    uploadArea.innerHTML = `
      <div class="upload-icon">📷</div>
      <div class="upload-text">Upload Magic Card Image</div>
      <div class="upload-subtext">Click to select or drag and drop an image</div>
    `;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';

    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'preview-container';

    container.appendChild(uploadArea);
    container.appendChild(this.fileInput);
    container.appendChild(this.previewContainer);

    this.shadowRoot.appendChild(container);
  }

  private setupEventListeners() {
    if (!this.shadowRoot) return;

    const uploadArea = this.shadowRoot.querySelector('.upload-area');
    
    uploadArea?.addEventListener('click', () => {
      this.fileInput?.click();
    });

    this.fileInput?.addEventListener('change', (e) => {
      this.handleFileSelect(e);
    });

    // Add keyboard support
    uploadArea?.addEventListener('keydown', (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        e.preventDefault();
        this.fileInput?.click();
      }
    });

    // Drag and drop support
    uploadArea?.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea?.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea?.addEventListener('drop', (e: Event) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const dragEvent = e as DragEvent;
      const files = dragEvent.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleFile(files[0]);
      }
    });
  }

  private handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  private handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    this.displayFileInfo(file);
    this.displayPreview(file);
    
    // TODO: In the future, this will use Chrome's LLM API to scan the card
    // Example: const text = await this.scanCardWithLLM(file);
  }

  private displayFileInfo(file: File) {
    if (!this.previewContainer) return;

    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `
      <strong>Selected file:</strong> ${file.name}<br>
      <strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB<br>
      <strong>Type:</strong> ${file.type}
    `;

    this.previewContainer.innerHTML = '';
    this.previewContainer.appendChild(fileInfo);
  }

  private displayPreview(file: File) {
    if (!this.previewContainer) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.className = 'preview-image';
      img.src = e.target?.result as string;
      img.alt = 'Card preview';
      this.previewContainer?.appendChild(img);
    };
    reader.readAsDataURL(file);
  }

  // Placeholder for future Chrome LLM API integration
  // https://developer.chrome.com/docs/ai/prompt-api
  private async scanCardWithLLM(_file: File): Promise<string> {
    // TODO: Implement Chrome LLM API integration
    // This will use the new Chrome AI APIs to scan magic cards
    // and extract text from the card image
    throw new Error('LLM scanning not yet implemented');
  }
}

customElements.define('card-reader', CardReader);
