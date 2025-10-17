from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, StaleElementReferenceException, NoSuchElementException, WebDriverException
import time
import json
import os # Digunakan untuk operasi file

# =======================================================================
# 1. KONFIGURASI TARGET DAN FUNGSI UTAMA
# =======================================================================
BASE_URL = "https://v1.samehadaku.how"


START_URL = "https://v1.samehadaku.how/anime/spy-x-family-season-3/" 

ANIME_DATA = {}


# Selectors untuk halaman DETAIL ANIME
INFO_AREA_SELECTOR = ".infoanime.widget_senction"
DETAIL_AREA_SELECTOR = ".anime.infoanime .spe span"
EPISODE_LIST_SELECTOR = ".lstepsiode.listeps ul li"

# Selectors untuk halaman EPISODE
OPTION_SELECTOR = "#server ul li div.east_player_option"
IFRAME_SELECTOR = "#player_embed iframe"
DOWNLOAD_AREA_SELECTOR = "div.download-eps"


# --- FUNGSI A: SCRAPE DETAIL ANIME ---
def scrape_anime_detail(driver):
    """Mengambil informasi dasar, deskripsi, detail, dan daftar episode."""
    # ... (Isi fungsi scrape_anime_detail tetap sama seperti sebelumnya) ...
    data = {'judul': 'N/A', 'link_poster': 'N/A', 'rating': 'N/A', 'deskripsi': 'N/A', 'genre': [], 'detail_anime': {}, 'list_episode': []}
    
    try:
        # Tunggu elemen info utama
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, INFO_AREA_SELECTOR))
        )

        info_section = driver.find_element(By.CSS_SELECTOR, INFO_AREA_SELECTOR)
        
        # 1. Judul & Poster
        try: data['judul'] = info_section.find_element(By.CSS_SELECTOR, 'h2.entry-title').text.replace('Nonton Anime ', '').strip()
        except: pass
        try: data['link_poster'] = info_section.find_element(By.CSS_SELECTOR, '.thumb img').get_attribute('src')
        except: pass

        # 2. Rating
        try:
            rating_value = info_section.find_element(By.CSS_SELECTOR, '.rtg span[itemprop="ratingValue"]').text
            rating_count = info_section.find_element(By.CSS_SELECTOR, '.rtg i[itemprop="ratingCount"]').get_attribute('content')
            data['rating'] = f"{rating_value} / 10 ({rating_count} Votes)"
        except: pass

        # 3. Deskripsi & Genre
        try:
            desc_elements = info_section.find_elements(By.CSS_SELECTOR, '.entry-content-single[itemprop="description"] p')
            data['deskripsi'] = "\n\n".join([p.text.strip() for p in desc_elements])
        except: pass
        try:
            genre_elements = info_section.find_elements(By.CSS_SELECTOR, '.genre-info a')
            data['genre'] = [g.text.strip() for g in genre_elements]
        except: pass

        # 4. Detail Anime (Sidebar)
        try:
            detail_elements = driver.find_elements(By.CSS_SELECTOR, DETAIL_AREA_SELECTOR)
            for detail in detail_elements:
                text_content = detail.get_attribute('innerHTML').strip()
                if '<b>' in text_content:
                    key = detail.find_element(By.TAG_NAME, 'b').text.replace(':', '').strip()
                    value = detail.text.replace(detail.find_element(By.TAG_NAME, 'b').text, '').strip()
                    data['detail_anime'][key] = value
                elif ':' in detail.text:
                    parts = detail.text.split(':', 1)
                    data['detail_anime'][parts[0].strip()] = parts[1].strip()
        except: pass

        # 5. List Episode Links
        try:
            episode_elements = driver.find_elements(By.CSS_SELECTOR, EPISODE_LIST_SELECTOR)
            for ep in episode_elements:
                link_el = ep.find_element(By.CSS_SELECTOR, '.lchx a')
                data['list_episode'].append({
                    'judul': link_el.text.strip(),
                    'link_halaman_episode': link_el.get_attribute('href'),
                    'tanggal': ep.find_element(By.CSS_SELECTOR, '.date').text.strip(),
                    'links_video_player': {},
                    'links_download': {}
                })
        except: pass
        
    except Exception as e:
        print(f"   [ERROR FATAL] Gagal mengambil detail halaman utama: {e}")
    
    return data

# --- FUNGSI B: SCRAPE LINK DOWNLOAD (STATIS) ---
def scrape_download_links(driver):
    """Mengambil semua link download dari elemen div.download-eps."""
    # ... (Isi fungsi scrape_download_links tetap sama seperti sebelumnya) ...
    downloads = {}
    try:
        download_sections = driver.find_elements(By.CSS_SELECTOR, DOWNLOAD_AREA_SELECTOR)
        
        for section in download_sections:
            category_b_elements = section.find_elements(By.TAG_NAME, 'b')
            if not category_b_elements: continue
            
            category = category_b_elements[0].text.strip()
            downloads[category] = {}
            
            list_items = section.find_elements(By.TAG_NAME, 'li')
            
            for item in list_items:
                resolution_strong = item.find_elements(By.TAG_NAME, 'strong')
                if not resolution_strong: continue
                    
                resolution = resolution_strong[0].text.strip()
                downloads[category][resolution] = {}
                
                link_elements = item.find_elements(By.TAG_NAME, 'a')
                
                for link_el in link_elements:
                    host_name = link_el.text.strip()
                    link_url = link_el.get_attribute('href')
                    
                    if host_name and link_url:
                        downloads[category][resolution][host_name] = link_url
                        
    except Exception as e:
        print(f"   [ERROR] Gagal saat scraping link download: {e}")
        
    return downloads

# --- FUNGSI C: SCRAPE LINK VIDEO PLAYER (DINAMIS) ---
def scrape_video_player_links(driver):
    """Mengambil semua link player melalui simulasi klik."""
    video_links = {}
    
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, OPTION_SELECTOR))
        )
        player_options = driver.find_elements(By.CSS_SELECTOR, OPTION_SELECTOR)
        player_options_total = len(player_options)

        for i in range(player_options_total):
            option_name = "N/A"
            try:
                # Ambil ulang elemen untuk mengatasi Stale Element
                player_options = driver.find_elements(By.CSS_SELECTOR, OPTION_SELECTOR)
                option = player_options[i]
                option_name = option.find_element(By.TAG_NAME, "span").text
                
                # Cek dulu apakah iframe ada di DOM sebelum mencoba klik/ambil SRC
                WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, IFRAME_SELECTOR))
                )
                
                # Ambil SRC yang sedang aktif (sebelum klik)
                old_src = driver.find_element(By.CSS_SELECTOR, IFRAME_SELECTOR).get_attribute("src")

                # LOGIKA KHUSUS UNTUK OPSI DEFAULT (i=0)
                if i == 0:
                    new_src = old_src
                
                else:
                    # Klik opsi server
                    driver.execute_script("arguments[0].click();", option)
                    
                    # Tambahkan jeda singkat untuk pemuatan script
                    time.sleep(0.5) 

                    # Tunggu hingga SRC yang baru berbeda dari yang lama
                    WebDriverWait(driver, 15).until(
                        lambda driver: driver.find_element(By.CSS_SELECTOR, IFRAME_SELECTOR).get_attribute("src") != old_src
                    )
                    time.sleep(1) # Jeda lagi untuk memastikan iframe stabil
                    new_src = driver.find_element(By.CSS_SELECTOR, IFRAME_SELECTOR).get_attribute("src")

                video_links[option_name] = new_src

            except TimeoutException:
                video_links[option_name] = "TIMEOUT: Iframe tidak berubah atau dimuat ulang"
            except StaleElementReferenceException:
                video_links[option_name] = "Element Stale: Gagal menemukan elemen setelah DOM refresh"
            except NoSuchElementException:
                video_links[option_name] = "NoSuchElement: Iframe tidak ditemukan di DOM"
            except Exception as inner_e:
                 video_links[option_name] = f"Error Tidak Diketahui: {str(inner_e).splitlines()[0]}"

    except Exception as e:
        print(f"   [ERROR] Gagal memulai/mengulang scraping player: {e}")
    
    return video_links

# --- FUNGSI D: SIMPAN KE FILE TXT ---
def save_to_file(data, filename):
    """Menyimpan data hasil scraping ke file TXT dalam format JSON."""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print(f"\n✅ Data berhasil disimpan ke file: {os.path.abspath(filename)}")
    except Exception as e:
        print(f"\n❌ Gagal menyimpan file: {e}")
        

# =======================================================================
# 2. ALUR UTAMA PROGRAM
# =======================================================================

try:
    print("Memulai Chrome Driver (Sesi Baru)...")
    driver = webdriver.Chrome() 
    
    # -------------------------------------------------------------
    # STEP 1: SCRAPE DETAIL ANIME UTAMA
    # -------------------------------------------------------------
    print(f"\n[STEP 1/2] Mengunjungi halaman detail anime: {START_URL}")
    driver.get(START_URL)
    ANIME_DATA = scrape_anime_detail(driver)
    
    total_episodes = len(ANIME_DATA.get('list_episode', []))
    print(f"✅ Detail anime berhasil diambil. Ditemukan {total_episodes} episode.")

    # -------------------------------------------------------------
    # STEP 2: LOOP & SCRAPE TIAP EPISODE
    # -------------------------------------------------------------
    print("\n" + "="*70)
    print(f"[STEP 2/2] Memulai Scraping {total_episodes} halaman episode...")
    print("="*70)

    # Loop terbalik agar episode terbaru diproses pertama
    for i, episode in enumerate(ANIME_DATA['list_episode']):
        
        episode_link = episode['link_halaman_episode']
        print(f"\n[{i+1}/{total_episodes}] Mengunjungi: {episode['judul']}")
        
        try:
            # Buka halaman episode
            driver.get(episode_link)
            
            # Scrape Link Download (Statis)
            episode['links_download'] = scrape_download_links(driver)
            
            # Scrape Link Video Player (Dinamis)
            episode['links_video_player'] = scrape_video_player_links(driver)

            print(f"   [STATUS] Berhasil scrape {len(episode['links_download'])} kategori download dan {len(episode['links_video_player'])} opsi player.")
            
        except Exception as e:
            print(f"   ❌ ERROR KRITIS saat memproses episode: {e}")
        # -------------------------------------------------------------
        # STEP 3: SIMPAN DAN TAMPILKAN HASIL AKHIR
        # -------------------------------------------------------------
        # Buat nama file berdasarkan judul anime
        judul_anime = ANIME_DATA.get('judul', 'anime_tidak_dikenal')
        safe_judul = "".join(c for c in judul_anime if c.isalnum() or c in (' ', '_', '-')).rstrip()

        # 📁 Buat folder output (jika belum ada)
        output_dir = "hasil_scrape"
        os.makedirs(output_dir, exist_ok=True)

        # Gabungkan nama folder + nama file
        filename = os.path.join(output_dir, f"{safe_judul}.txt")

        # Simpan data
        save_to_file(ANIME_DATA, filename)

    
except WebDriverException as e:
    print(f"\n❌ Gagal membuka Chrome/WebDriver. Pastikan ChromeDriver kompatibel dan Chrome tertutup.")
except Exception as e:
    print(f"\n❌ Terjadi kesalahan fatal: {e}")

finally:
    # 4. Tutup browser
    if 'driver' in locals() and driver:
        driver.quit()