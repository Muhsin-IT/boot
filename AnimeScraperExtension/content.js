// =======================================================================
// Selectors Global
// =======================================================================
const OPTION_SELECTOR = "#server ul li div.east_player_option";
const IFRAME_SELECTOR = "#player_embed iframe";
const DOWNLOAD_AREA_SELECTOR = "div.download-eps";
const EPISODE_TITLE_SELECTOR = "h1.entry-title"; 

// Selectors untuk halaman DETAIL ANIME
const INFO_AREA_SELECTOR = ".infoanime.widget_senction";
const DETAIL_AREA_SELECTOR = ".anime.infoanime .spe span";
const EPISODE_LIST_SELECTOR = ".lstepsiode.listeps ul li";
const WARNING_SELECTOR = "div.alr"; // Selector BARU untuk peringatan konten
// Selector BARU untuk Halaman Daftar Anime
const ANIME_LIST_SELECTOR = "div.listpst ul li a";

// --- Fungsi untuk memberi jeda (sleep)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Fungsi Baru: Menunggu Iframe Muncul Kembali (Active Recovery)
const waitForIframe = () =>
  new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (document.querySelector(IFRAME_SELECTOR)) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - startTime > 15000) {
        // WAKTU PEMULIHAN 15 DETIK
        clearInterval(interval);
        reject(
          new Error(
            "RECOVERY FAILED: Iframe gagal muncul kembali setelah 15 detik."
          )
        );
      }
    }, 500);
  });

// --- FUNGSI A: SCRAPE DETAIL ANIME ---
function scrapeDetailData() {
  // Tambahkan 'peringatan: 0' di posisi yang diinginkan (setelah detail_anime)
  const data = {
    judul: "N/A",
    link_poster: "N/A",
    rating: "N/A",
    deskripsi: "N/A",
    genre: [],
    detail_anime: {},
    peringatan: 0,
    list_episode: [],
  };

  try {
    const infoSection = document.querySelector(INFO_AREA_SELECTOR);
    if (!infoSection)
      throw new Error("Blok informasi anime utama tidak ditemukan.");

    // Judul & Poster
    data.judul =
      infoSection
        .querySelector("h2.entry-title")
        ?.textContent.replace("Nonton Anime ", "")
        .trim() || "N/A";
    data.link_poster = infoSection.querySelector(".thumb img")?.src || "N/A";

    // Rating
    const rtg = infoSection.querySelector(".rtg");
    if (rtg) {
      const ratingValue = rtg
        .querySelector('span[itemprop="ratingValue"]')
        ?.textContent.trim();
      const ratingCount = infoSection
        .querySelector('i[itemprop="ratingCount"]')
        ?.getAttribute("content");
      data.rating = `${ratingValue} / 10 (${ratingCount} Votes)` || "N/A";
    }

    // Deskripsi & Genre
    const descElements = infoSection.querySelectorAll(
      '.entry-content-single[itemprop="description"] p'
    );
    data.deskripsi = Array.from(descElements)
      .map((p) => p.textContent.trim())
      .join("\n\n");

    const genreElements = infoSection.querySelectorAll(".genre-info a");
    data.genre = Array.from(genreElements).map((g) => g.textContent.trim());

    // Detail Anime (Sidebar)
    document.querySelectorAll(DETAIL_AREA_SELECTOR).forEach((detail) => {
      const strongElement = detail.querySelector("b");
      let key, value;

      if (strongElement) {
        key = strongElement.textContent.replace(":", "").trim();
        value = detail.textContent
          .replace(strongElement.textContent, "")
          .trim();
      } else if (detail.textContent.includes(":")) {
        const parts = detail.textContent.split(":", 1);
        key = parts[0].trim();
        value = detail.textContent.slice(key.length + 1).trim();
      }
      if (key && value) data.detail_anime[key] = value;
    });

    // 5. Peringatan Konten (alr) - LOGIKA BARU Ditempatkan di sini
    if (document.querySelector(WARNING_SELECTOR)) {
      data.peringatan = 1;
    }

    // List Episode Links
    document.querySelectorAll(EPISODE_LIST_SELECTOR).forEach((li) => {
      const linkEl = li.querySelector(".lchx a");
      const dateEl = li.querySelector(".date");
      if (linkEl && dateEl) {
        data.list_episode.push({
          judul: linkEl.textContent.trim(),
          link_halaman_episode: linkEl.href,
          tanggal: dateEl.textContent.trim(),
        });
      }
    });
  } catch (e) {
    data.error = `ERROR saat scrape detail: ${e.message}`;
  }
  return data;
}


// --- FUNGSI B: SCRAPE LINK DOWNLOAD (Statis) ---
function scrapeDownloadData() {
    const downloads = {};
    const downloadSections = document.querySelectorAll(DOWNLOAD_AREA_SELECTOR);
    
    downloadSections.forEach(section => {
        const categoryElement = section.querySelector('b');
        if (!categoryElement) return;

        const category = categoryElement.textContent.trim();
        downloads[category] = {};
        
        section.querySelectorAll('li').forEach(item => {
            const resolutionElement = item.querySelector('strong');
            if (!resolutionElement) return;

            const resolution = resolutionElement.textContent.trim();
            downloads[category][resolution] = {};
            
            item.querySelectorAll('a').forEach(linkEl => {
                const hostName = linkEl.textContent.trim();
                const linkUrl = linkEl.href;
                
                if (hostName && linkUrl) {
                    downloads[category][resolution][hostName] = linkUrl;
                }
            });
        });
    });
    return downloads;
}


// --- FUNGSI C: SCRAPE EPISODE DATA (FINAL WITH ACTIVE RECOVERY) ---
async function scrapeEpisodeData() {
    
    // --- Ambil Info Episode Statis & Inisialisasi ---
    let episodeInfo = {
        judul: 'Judul Episode Tidak Ditemukan',
        link_halaman_episode: window.location.href,
        tanggal: 'N/A' // <-- TAMBAHAN: Key untuk tanggal rilis
    };
    const currentUrl = window.location.href; 
    
    try {
        const titleElement = document.querySelector(EPISODE_TITLE_SELECTOR);
        if (titleElement) episodeInfo.judul = titleElement.textContent.trim();
    } catch (e) {
        console.error("Gagal mengambil info statis episode:", e);
    }
    
    // --- LOGIKA: Ambil Tanggal Rilis dari Daftar Episode ---
    try {
        const episodeListItems = document.querySelectorAll(EPISODE_LIST_SELECTOR);
        
        for (const li of episodeListItems) {
            const linkEl = li.querySelector('.lchx a');
            const dateEl = li.querySelector('.date');
            
            if (linkEl && dateEl && linkEl.href === currentUrl) {
                episodeInfo.tanggal = dateEl.textContent.trim();
                break; 
            }
        }
    } catch (e) {
        console.error("Gagal mengambil tanggal dari daftar episode:", e);
    }
    // ------------------------------------------------------------

    const videoLinks = {};
    
    // Fungsi tunggu perubahan SRC (tetap 15 detik)
    const waitForChange = (iframeElement, oldSrc) => new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const newIframe = document.querySelector(IFRAME_SELECTOR);
            if (!newIframe) {
                clearInterval(interval);
                resolve(false); 
                return;
            }
            
            if (newIframe.src !== oldSrc) {
                clearInterval(interval);
                resolve(true); 
            } else if (Date.now() - startTime > 15000) { 
                clearInterval(interval);
                reject(new Error("Timeout: Iframe src tidak berubah."));
            }
        }, 500);
    });

    try {
        const options = document.querySelectorAll(OPTION_SELECTOR);
        if (options.length === 0) throw new Error("Opsi player tidak ditemukan.");
        
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const optionName = option.querySelector('span').textContent.trim();
            
            try {
                let currentIframe = document.querySelector(IFRAME_SELECTOR);
                if (!currentIframe) {
                    throw new Error("Iframe target tidak ada di DOM.");
                }

                const oldSrc = currentIframe.src;

                if (i === 0) {
                    videoLinks[optionName] = oldSrc;
                } else {
                    option.click(); 
                    await sleep(500); 
                    
                    try {
                        await waitForChange(currentIframe, oldSrc);
                        currentIframe = document.querySelector(IFRAME_SELECTOR);
                        if (!currentIframe) throw new Error("Iframe hilang setelah klik dan tunggu.");

                        videoLinks[optionName] = currentIframe.src;
                    } catch (e) {
                        videoLinks[optionName] = `ERROR: ${e.message}`; 
                    }
                }

            } catch (e) {
                videoLinks[optionName] = `ERROR KRITIS OPSI: ${e.message}`;
                try {
                    await waitForIframe();
                } catch (recoveryError) {
                    videoLinks[optionName] += ` | ${recoveryError.message}`;
                }
                continue; 
            }
        }
        
        const downloadLinks = scrapeDownloadData();
        
        return { 
            judul: episodeInfo.judul,
            link_halaman_episode: episodeInfo.link_halaman_episode,
            tanggal: episodeInfo.tanggal,
            links_video_player: videoLinks, 
            links_download: downloadLinks 
        };

    } catch (e) {
        return { error: `ERROR KRITIS di halaman episode: ${e.message}` };
    }
}


// --- FUNGSI BARU: Scraping Daftar Anime (Real-Time Chunking) ---
function scrapeAnimeListLinks() {
    const listElements = document.querySelectorAll(ANIME_LIST_SELECTOR);
    const totalLinks = listElements.length;
    
    if (totalLinks === 0) {
        return { error: "Tidak ditemukan tautan daftar anime." }; 
    }

    const scrapedChunk = { list: [] };
    let chunkCounter = 0; 
    let linksSentCount = 0; // Total links yang sudah dikirimkan

    listElements.forEach((linkEl, index) => {
        const title = linkEl.textContent.trim();
        const url = linkEl.href;
        
        if (title && url && url.includes('/anime/')) {
            scrapedChunk.list.push({ title: title, url: url });
            chunkCounter++;
        }
        
        const isFinal = index === totalLinks - 1;

        // LOGIKA PENGIRIMAN REAL-TIME (setiap 100 link atau saat mencapai akhir)
        if (chunkCounter === 100 || isFinal) {
            
            // Hitung total yang sudah diakumulasi
            linksSentCount += scrapedChunk.list.length;

            chrome.runtime.sendMessage({ 
                action: "list_update", 
                chunk: scrapedChunk.list,
                total_scraped: linksSentCount, 
                total_expected: totalLinks,
                page_url: window.location.href,
                is_final_chunk: isFinal
            });
            
            // Reset chunk
            scrapedChunk.list = [];
            chunkCounter = 0;
        }
    });

    // Mengembalikan objek status yang akan diabaikan oleh startScrapingFlow
    return { status: "Scraping List Selesai. Data dikirimkan real-time." };
}


// --- FUNGSI PENGONTROL ALUR EKSEKUSI ---
async function startScrapingFlow(sendResponse) {
    let results = {};
    const url = window.location.href;
    let isListScrape = false; // Flag untuk menonaktifkan alur penyimpanan lama

    // Kriteria 1: Halaman Detail Anime (URL mengandung '/anime/')
    if (url.includes("/anime/") && !url.includes("-episode-")) { 
        results = scrapeDetailData();
    
    // Kriteria 2: Halaman Episode REGULER (URL mengandung '-episode-')
    } else if (url.includes("-episode-")) {
        results = await scrapeEpisodeData();
    
    // Kriteria 3: Halaman Movie/Special/OVA (Ada Judul Episode/Movie dan Area Download)
    } else if (document.querySelector(EPISODE_TITLE_SELECTOR) && document.querySelector(DOWNLOAD_AREA_SELECTOR)) {
        results = await scrapeEpisodeData();
        
    // Kriteria 4 (FITUR BARU): Halaman Daftar Anime (Cek URL 'daftar-anime' atau selector list)
    } else if (url.includes("daftar-anime") || document.querySelector(ANIME_LIST_SELECTOR)) {
        results = scrapeAnimeListLinks();
        isListScrape = true; // SET FLAG TRUE
    
    } else {
        results = { error: "Bukan halaman yang didukung untuk scraping." };
    }
    
    // PERBAIKAN KRITIS: Hanya jalankan alur penyimpanan lama jika BUKAN list scrape.
    if (!isListScrape) {
        await chrome.storage.local.set({ scrapedData: results });
        chrome.runtime.sendMessage({ action: "data_ready" }); 
    }
}

// Menerima pesan dari popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_scrape") {
        startScrapingFlow(sendResponse); 
        return true; 
    }
});