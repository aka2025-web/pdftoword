/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Thư viện bên ngoài ---
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';

// --- Lấy các phần tử DOM ---
const uploadInput = document.getElementById('pdf-upload') as HTMLInputElement;
const uploadArea = document.querySelector('.upload-area') as HTMLDivElement;
const fileNameSpan = document.getElementById('file-name') as HTMLSpanElement;
const convertBtn = document.getElementById('convert-btn') as HTMLButtonElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const resultContainer = document.getElementById('result-container') as HTMLDivElement;
const outputDiv = document.getElementById('output') as HTMLDivElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const downloadXlsBtn = document.getElementById('download-xls-btn') as HTMLButtonElement;

// --- Quản lý trạng thái ứng dụng ---
let selectedFile: File | null = null;
let rawTextResult = ''; // Lưu trữ văn bản Markdown thô để sao chép

// --- Các hàm tiện ích (Helpers) ---

/**
 * Chuyển đổi một đối tượng File sang định dạng Part của GoogleGenerativeAI.
 * @param file File cần chuyển đổi.
 * @returns Một Promise phân giải thành đối tượng Part.
 */
async function fileToGenerativePart(file: File): Promise<{inlineData: {data: string, mimeType: string}}> {
  const base64EncodedData = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: base64EncodedData, mimeType: file.type },
  };
}

/**
 * Xử lý file được chọn (từ input hoặc kéo thả).
 * @param file File được người dùng cung cấp.
 */
function handleFile(file: File) {
  if (file && file.type === 'application/pdf') {
    selectedFile = file;
    fileNameSpan.textContent = selectedFile.name;
    convertBtn.disabled = false;
  } else {
    alert('Vui lòng chỉ chọn hoặc kéo thả file PDF.');
    selectedFile = null;
    fileNameSpan.textContent = 'Chưa có file nào được chọn';
    convertBtn.disabled = true;
  }
}

/**
 * Tải nội dung xuống dưới dạng file.
 * @param content Nội dung HTML của file.
 * @param mimeType Loại MIME cho file (Word hoặc Excel).
 * @param extension Phần mở rộng của file (.doc hoặc .xls).
 */
function downloadFile(content: string, mimeType: string, extension: string) {
  if (!content) return;
  
  // Tạo header HTML để Microsoft Office có thể đọc được
  const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' 
        xmlns:w='urn:schemas-microsoft-com:office:word' 
        xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Export HTML</title></head><body>`;
  const footer = "</body></html>";
  const sourceHTML = header + content + footer;

  const source = `data:${mimeType};charset=utf-8,` + encodeURIComponent(sourceHTML);
  const link = document.createElement("a");
  link.href = source;
  const baseName = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : "converted";
  link.download = `${baseName}.${extension}`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Các hàm quản lý giao diện (UI Management) ---

/**
 * Cập nhật trạng thái giao diện khi đang tải hoặc đã tải xong.
 * @param isLoading Trạng thái tải (true = đang tải, false = đã xong).
 */
function setLoadingState(isLoading: boolean) {
  convertBtn.disabled = isLoading;
  loader.classList.toggle('hidden', !isLoading);
  if (isLoading) {
    resultContainer.classList.add('hidden');
    outputDiv.innerHTML = '';
  }
}

/**
 * Hiển thị kết quả chuyển đổi trên giao diện.
 * @param htmlContent Nội dung HTML đã được phân tích từ Markdown.
 */
function renderResult(htmlContent: string) {
    outputDiv.innerHTML = htmlContent;
    resultContainer.classList.remove('hidden');
}

/**
 * Hiển thị thông báo lỗi trên giao diện.
 * @param error Đối tượng lỗi.
 */
function renderError(error: unknown) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputDiv.innerHTML = `<p style="color: red;">Đã xảy ra lỗi: ${errorMessage}</p>`;
    resultContainer.classList.remove('hidden');
}

// --- Gán các sự kiện (Event Listeners) ---

// Mở cửa sổ chọn file khi nhấp vào khu vực tải lên
uploadArea.addEventListener('click', () => uploadInput.click());

// Xử lý khi người dùng chọn file từ cửa sổ
uploadInput.addEventListener('change', () => {
  if (uploadInput.files && uploadInput.files.length > 0) {
    handleFile(uploadInput.files[0]);
  }
});

// Xử lý sự kiện kéo thả file
uploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});
uploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (event.dataTransfer?.files.length) {
    handleFile(event.dataTransfer.files[0]);
  }
});

/**
 * Sự kiện chính: Nhấp vào nút "Chuyển đổi".
 */
convertBtn.addEventListener('click', async () => {
  if (!selectedFile) {
    alert('Vui lòng chọn một file PDF.');
    return;
  }

  setLoadingState(true);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const filePart = await fileToGenerativePart(selectedFile);
    const prompt = `Trích xuất tất cả văn bản, bảng biểu, và giữ nguyên cấu trúc từ file PDF này. 
    Định dạng kết quả đầu ra bằng Markdown. 
    Hãy cố gắng giữ lại nhiều nhất có thể định dạng gốc, bao gồm các tiêu đề, danh sách, in đậm, in nghiêng và các bảng.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: [filePart, {text: prompt}] },
    });

    rawTextResult = response.text;
    const htmlContent = await marked.parse(rawTextResult);
    renderResult(htmlContent);

  } catch (error) {
    renderError(error);
  } finally {
    setLoadingState(false);
  }
});

/**
 * Sự kiện: Sao chép văn bản thô vào clipboard.
 */
copyBtn.addEventListener('click', () => {
  if (!rawTextResult) return;
  navigator.clipboard.writeText(rawTextResult).then(() => {
    alert('Đã sao chép vào clipboard!');
  }).catch(err => {
    console.error('Không thể sao chép: ', err);
    alert('Sao chép thất bại.');
  });
});

/**
 * Sự kiện: Tải xuống file Word (.doc).
 */
downloadBtn.addEventListener('click', () => {
  downloadFile(outputDiv.innerHTML, 'application/vnd.ms-word', 'doc');
});

/**
 * Sự kiện: Tải xuống file Excel (.xls).
 */
downloadXlsBtn.addEventListener('click', () => {
  downloadFile(outputDiv.innerHTML, 'application/vnd.ms-excel', 'xls');
});
