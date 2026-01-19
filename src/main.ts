import './style.css'
import './card-reader'

console.log('Card Scanner initialized');

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

// DOM elements
const downloadModelBtn = document.getElementById('downloadModelBtn') as HTMLButtonElement | null;
const modelStatus = document.getElementById('modelStatus') as HTMLDivElement | null;
const languageModel = (self as any).LanguageModel as LanguageModelAPI | undefined;

// UI state management
const setReadyState = () => {
  if (downloadModelBtn) {
    downloadModelBtn.style.display = 'none';
  }
  if (modelStatus) {
    modelStatus.textContent = 'Model ready';
  }
};

const setErrorState = (message: string) => {
  if (modelStatus) {
    modelStatus.textContent = message;
  }
  if (downloadModelBtn) {
    downloadModelBtn.disabled = true;
  }
};

// Core model operations
const checkAvailability = async (): Promise<ModelAvailability> => {
  if (!languageModel) {
    throw new Error('LanguageModel API is not supported in this browser.');
  }
  return await languageModel.availability();
};

const downloadModel = async (): Promise<void> => {
  console.log('model download started');
  
  if (downloadModelBtn) {
    downloadModelBtn.disabled = true;
  }

  await languageModel!.create({
    monitor(m) {
      m.addEventListener('downloadprogress', (event) => {
        const e = event as DownloadProgressEvent;
        console.log('downloadprogress', e);
        
        const percent = Math.round((e.loaded / (e.total || e.loaded)) * 100);
        
        if (modelStatus) {
          modelStatus.textContent = percent >= 100
            ? 'Extracting and loading model...'
            : `Downloading... ${percent}%`;
        }

        if (e.loaded === 1) {
          console.log('model download finished');
        }
      });
    },
  });

  console.log('Model ready');
};

const handleModelReady = () => {
  console.log('model loaded');
  setReadyState();
};

// Initialize on page load
const initializeModelState = async () => {
  try {
    const availability = await checkAvailability();
    
    if (availability === 'available') {
      handleModelReady();
    } else if (availability === 'unavailable') {
      setErrorState('LanguageModel is not available on this device.');
    }
  } catch (error) {
    console.error('Model initialization error:', error);
    setErrorState('LanguageModel API not supported.');
  }
};

// Button click handler
downloadModelBtn?.addEventListener('click', async () => {
  try {
    const availability = await checkAvailability();

    if (availability === 'available') {
      handleModelReady();
      return;
    }

    if (availability === 'unavailable') {
      throw new Error('LanguageModel is not available.');
    }

    await downloadModel();
    setReadyState();
  } catch (error) {
    console.error('Model download error:', error);
    
    if (modelStatus) {
      modelStatus.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
    if (downloadModelBtn) {
      downloadModelBtn.disabled = false;
    }
  }
});

initializeModelState();
