// Type declarations for Chrome AI API
type ModelAvailability = 'available' | 'unavailable' | 'downloadable' | 'downloading';

interface DownloadProgressEvent {
  loaded: number;
  total: number;
}

interface LanguageModelAPI {
  availability(): Promise<ModelAvailability>;
  create(options?: { monitor?: (m: EventTarget) => void }): Promise<unknown>;
}

const languageModel = (self as { LanguageModel?: LanguageModelAPI }).LanguageModel;

// UI state updates
const showModelReady = (button: HTMLButtonElement, status: HTMLElement) => {
  console.log('model loaded');
  button.style.display = 'none';
  status.textContent = '';
  status.style.display = 'none';
  status.setAttribute('aria-hidden', 'true');
};

const showError = (button: HTMLButtonElement, status: HTMLElement, message: string) => {
  status.style.display = 'block';
  status.removeAttribute('aria-hidden');
  status.textContent = message;
  button.disabled = false; // Allow retry
  button.textContent = 'Retry Download';
};

const updateDownloadProgress = (status: HTMLElement, percent: number) => {
  status.style.display = 'block';
  status.removeAttribute('aria-hidden');
  status.textContent = percent >= 100
    ? 'Extracting and loading model...'
    : `Downloading... ${percent}%`;
};

// Model availability check
const checkAvailability = async (): Promise<ModelAvailability> => {
  if (!languageModel) {
    throw new Error('LanguageModel API is not supported in this browser.');
  }
  return await languageModel.availability();
};

// Download and monitor model progress
const downloadModel = async (button: HTMLButtonElement, status: HTMLElement): Promise<void> => {
  console.log('model download started');
  button.disabled = true;
  button.textContent = 'Downloading...';

  if (!languageModel) {
    throw new Error('LanguageModel API is not supported in this browser.');
  }

  try {
    await languageModel.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (event) => {
          const e = event as unknown as DownloadProgressEvent;
          console.log('downloadprogress', e);
          
          const percent = Math.round((e.loaded / (e.total || e.loaded)) * 100);
          updateDownloadProgress(status, percent);

          if (e.loaded === 1) {
            console.log('model download finished');
          }
        });
      },
    });

    console.log('Model ready');
  } catch (error) {
    // Re-enable button for retry
    button.disabled = false;
    button.textContent = 'Retry Download';
    throw error;
  }
};

// Handle model availability and download
const ensureModelReady = async (button: HTMLButtonElement, status: HTMLElement): Promise<void> => {
  const availability = await checkAvailability();

  if (availability === 'available') {
    showModelReady(button, status);
    return;
  }

  if (availability === 'unavailable') {
    throw new Error('LanguageModel is not available on this device.');
  }

  // Model is downloadable or downloading
  await downloadModel(button, status);
  showModelReady(button, status);
};

// Show card reader once model is ready
const addCardReader = () => {
  const container = document.getElementById('readerList');
  if (!container) return;
  const cardReader = document.createElement('card-reader');
  // Prepend so newest reader appears at the top of the list
  container.prepend(cardReader);
};

const showReaderControls = () => {
  const controls = document.getElementById('readerControls');
  if (controls) controls.style.display = 'flex';
};

const onModelReady = () => {
  showReaderControls();
  addCardReader();
};

// Initialize model state on page load
const initializeModelState = async (button: HTMLButtonElement, status: HTMLElement) => {
  try {
    await ensureModelReady(button, status);
    onModelReady();
  } catch (error) {
    console.error('Model initialization error:', error);
    const message = error instanceof Error ? error.message : 'LanguageModel API not supported.';
    showError(button, status, message);
  }
};

// Handle download button click
const handleDownloadClick = async (button: HTMLButtonElement, status: HTMLElement) => {
  try {
    await ensureModelReady(button, status);
    onModelReady();
  } catch (error) {
    console.error('Model download error:', error);
    const message = error instanceof Error ? error.message : 'Download failed. Please try again.';
    showError(button, status, `Error: ${message}`);
  }
};

export const setupModelDownloader = (button: HTMLButtonElement, status: HTMLElement) => {
  const addBtn = document.getElementById('addCardReaderBtn');
  
  initializeModelState(button, status);
  button.addEventListener('click', () => handleDownloadClick(button, status));
  addBtn?.addEventListener('click', addCardReader);
};
