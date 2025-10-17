// popup.js
// Deklarasi Variabel Global (Diletakkan di bagian paling atas file, di luar DOMContentLoaded)
let allScrapedAnimeLinks = []; // Menyimpan semua link yang diterima
let isListScraping = false;   // Flag status real-time

document.addEventListener('DOMContentLoaded', () => {
    const scrapeButton = document.getElementById('scrapeButton');
    const hapusButton = document.getElementById('hapusButton');
    const copyButton = document.getElementById('copyButton'); // <-- PASTIKAN INI ADA DI popup.html
    const statusDiv = document.getElementById('status');
    const resultsDiv = document.getElementById('results');

    // === Fungsi tampilkan data dari chrome.storage.local ===
    function tampilkanDataTerakhir() {
        // Hanya tampilkan data dari storage (alur lama)
        chrome.storage.local.get('scrapedData', (data) => {
            if (data.scrapedData) {
                statusDiv.textContent = 'Status: Data tersimpan.';
                resultsDiv.textContent = JSON.stringify(data.scrapedData, null, 4); 
            } else {
                statusDiv.textContent = 'Status: Belum ada data tersimpan.';
                resultsDiv.textContent = '';
            }
        });
    }

    // === Jalankan saat popup dibuka ===
    tampilkanDataTerakhir();

    // === Saat popup menerima sinyal dari content.js ===
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        
        // --- Kriteria 1: Sinyal Selesai dari Scraping Normal (Detail/Episode) ---
        if (request.action === "data_ready") {
            
            // Hentikan mode list scraping (jika aktif)
            isListScraping = false;
            allScrapedAnimeLinks = []; 

            statusDiv.textContent = 'Status: Data siap. Mengambil dari penyimpanan...';

            // Ambil data dari storage seperti biasa
            chrome.storage.local.get('scrapedData', (data) => {
                if (data.scrapedData) {
                    statusDiv.textContent = 'Status: Scraping Selesai. ✅';
                    resultsDiv.textContent = JSON.stringify(data.scrapedData, null, 4); 
                } else {
                    statusDiv.textContent = 'Status: ERROR. Sinyal diterima, tapi data kosong.';
                }
            });
            
        // --- Kriteria 2 (BARU): Menerima Update Daftar Link Real-Time ---
        } else if (request.action === "list_update") {
            
            isListScraping = true;
            
            // 1. Simpan chunk baru ke variabel global
            allScrapedAnimeLinks = allScrapedAnimeLinks.concat(request.chunk);

            const totalScraped = allScrapedAnimeLinks.length;
            const totalExpected = request.total_expected;
            const pageUrl = request.page_url || 'URL Tidak Dikenal';

            // 2. Update status real-time
            statusDiv.textContent = `Status: Scraping Daftar Anime... ${totalScraped} dari ${totalExpected} links diproses.`;

            // 3. Bangun seluruh JSON untuk tampilan real-time
            // Header JSON
            let jsonOutput = `{\n    "type": "Anime List",\n    "page_url": "${pageUrl}",\n    "total_scraped": ${totalScraped},\n    "list": [\n`;

            // Isi list (setiap item diproses menjadi string JSON)
            const listContent = allScrapedAnimeLinks.map(item => {
                const safeTitle = item.title.replace(/"/g, '\\"');
                return `        {\n            "title": "${safeTitle}",\n            "url": "${item.url}"\n        }`;
            }).join(',\n');
            
            jsonOutput += listContent;

            // 4. Sinyal Selesai: Tutup array JSON
            if (totalScraped >= totalExpected) {
                 jsonOutput += `\n    ]\n}`;
                 statusDiv.textContent = `Status: Scraping Daftar Anime Selesai! Total ${totalScraped} links. ✅`;
                 isListScraping = false;
            } else {
                 // Jika belum selesai, tambahkan koma dan tunggu chunk berikutnya
                jsonOutput += `,\n`; 
            }

            // Tampilkan JSON di resultsDiv
            resultsDiv.textContent = jsonOutput;
            
            // Scroll ke bawah agar pengguna melihat data baru
            resultsDiv.scrollTop = resultsDiv.scrollHeight;
        }
        
        sendResponse({}); 
    });


    // === Saat klik tombol "Mulai Scraping" ===
    scrapeButton.addEventListener('click', () => {
        // Reset state saat memulai scrape baru
        allScrapedAnimeLinks = [];
        isListScraping = false;
        
        statusDiv.textContent = 'Status: Mengirim permintaan dan menunggu...';
        resultsDiv.textContent = '';

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "start_scrape" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("Channel pesan ditutup (Normal):", chrome.runtime.lastError.message);
                }
            });
        });
    });

    // === Saat klik tombol "Hapus Data" ===
    hapusButton.addEventListener('click', () => {
        // Reset state saat menghapus data
        allScrapedAnimeLinks = [];
        isListScraping = false;
        
        chrome.storage.local.remove('scrapedData', () => {
            statusDiv.textContent = 'Status: Data dihapus.';
            resultsDiv.textContent = '';
        });
    });
    
    // === TAMBAHAN: Saat klik tombol "Salin JSON" ===
    copyButton.addEventListener('click', () => {
        let textToCopy = resultsDiv.textContent;

        if (textToCopy.trim().length === 0 || statusDiv.textContent.includes('Belum ada data')) {
            statusDiv.textContent = 'Status: Tidak ada data untuk disalin.';
            return;
        }
        
        // Perbaikan: Jika proses list scraping belum selesai, tutup JSON agar valid
        if (isListScraping && !textToCopy.trim().endsWith('}')) {
             // Cari koma-koma terakhir yang tidak perlu dan tutup array/objek
             const lastCommaIndex = textToCopy.lastIndexOf(',\n');
             if (lastCommaIndex !== -1) {
                 textToCopy = textToCopy.substring(0, lastCommaIndex) + '\n    ]\n}';
             } else {
                 textToCopy = textToCopy + '\n    ]\n}';
             }
        }


        // Menggunakan Clipboard API modern
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = statusDiv.textContent;
            statusDiv.textContent = 'Status: JSON berhasil disalin! ✅';
            setTimeout(() => {
                statusDiv.textContent = originalText;
            }, 1500);
        }).catch(err => {
            statusDiv.textContent = `Status: Gagal menyalin. Error: ${err}`;
            console.error('Gagal menyalin:', err);
        });
    });
});