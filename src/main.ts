import './style.css'
import './card-reader'
import { setupModelDownloader } from './model-downloader'

console.log('Card Scanner initialized');

const downloadModelBtn = document.getElementById('downloadModelBtn') as HTMLButtonElement | null;
const modelStatus = document.getElementById('modelStatus') as HTMLDivElement | null;

if (downloadModelBtn && modelStatus) {
  setupModelDownloader(downloadModelBtn, modelStatus);
}
