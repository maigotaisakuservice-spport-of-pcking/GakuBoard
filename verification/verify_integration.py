from playwright.sync_api import sync_playwright

def verify_integration_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate to School Admin (Simulate)
        # Note: Redirects to login, but we can inspect static file structure if auth allows,
        # or we verify the structure of the HTML file directly via mock if possible.
        # But `school-admin.html` is protected by JS auth guard.

        # Let's inspect `school-admin.html` source code logic via simple text check first
        # to ensure the tabs and sections are there.
        import requests
        try:
            resp = requests.get("http://localhost:8080/school-admin.html")
            html = resp.text

            checks = [
                "外部サービス連携", # Header for sync
                "Google Classroom 連携",
                "Microsoft Teams 連携",
                "MEXCBT配信管理", # Header for MEXCBT
                "js/mexcbt-service.js", # Script include
                "js/integration-service.js" # Script include
            ]

            for check in checks:
                if check in html:
                    print(f"Verified: {check} exists in HTML.")
                else:
                    print(f"FAILED: {check} missing in HTML.")

        except Exception as e:
            print(f"Request failed: {e}")

        # 2. Navigate to Student Dashboard (Simulate)
        try:
            resp = requests.get("http://localhost:8080/student-dashboard.html")
            html = resp.text

            checks = [
                "MEXCBT / まなびログ",
                "新着テスト",
                "受験履歴",
                "js/mexcbt-service.js"
            ]

            for check in checks:
                if check in html:
                    print(f"Verified Student DB: {check} exists.")
                else:
                    print(f"FAILED Student DB: {check} missing.")

        except Exception as e:
            print(e)

        browser.close()

if __name__ == "__main__":
    verify_integration_ui()
