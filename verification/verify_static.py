import os
from playwright.sync_api import sync_playwright

def verify_static_pages():
    pages = [
        {"path": "login.html", "selector": "h1", "text": "GAKU-Board"},
        {"path": "super-admin.html", "selector": "h1", "text": "GAKU-Board スーパー管理"},
        {"path": "tenant-admin.html", "selector": "h1", "text": "テナント管理"},
        {"path": "school-admin.html", "selector": "h1", "text": "学校管理"},
        {"path": "teacher-dashboard.html", "selector": "nav button", "text": "ホーム"},
        {"path": "student-dashboard.html", "selector": "header", "text": "ログアウト"},
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for page_info in pages:
            page = browser.new_page()
            url = f"file://{os.getcwd()}/{page_info['path']}"
            print(f"Checking {url}...")

            try:
                page.goto(url)
                # Check for selector
                element = page.wait_for_selector(page_info['selector'], timeout=5000)
                if page_info['text']:
                    content = element.inner_text()
                    if page_info['text'] not in content:
                        print(f"FAILED: {page_info['path']} - Expected '{page_info['text']}', found '{content}'")
                    else:
                        print(f"PASSED: {page_info['path']}")
                else:
                    print(f"PASSED: {page_info['path']} (Selector found)")

                page.screenshot(path=f"verification/screenshot_{page_info['path'].replace('.html', '')}.png")
            except Exception as e:
                print(f"FAILED: {page_info['path']} - {e}")

            page.close()
        browser.close()

if __name__ == "__main__":
    verify_static_pages()
