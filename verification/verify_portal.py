from playwright.sync_api import sync_playwright

def verify_portal_and_preview():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. School Admin Portal Preview
        # Navigate to School Admin page (HTML check only as auth blocks execution)
        import requests
        try:
            resp = requests.get("http://localhost:8080/school-admin.html")
            html = resp.text

            checks = [
                "学習ポータル管理 (全体)", # New tab
                "生徒プレビュー", # Preview button
                "preview-modal", # Modal ID
                "iframe id=\"preview-frame\"" # Iframe
            ]

            for check in checks:
                if check in html:
                    print(f"Verified School Admin: {check} exists.")
                else:
                    print(f"FAILED School Admin: {check} missing.")

        except Exception as e:
            print(f"Request failed: {e}")

        # 2. Teacher Portal Preview
        try:
            resp = requests.get("http://localhost:8080/teacher-dashboard.html")
            html = resp.text

            checks = [
                "生徒プレビュー",
                "preview-modal"
            ]

            for check in checks:
                if check in html:
                    print(f"Verified Teacher Admin: {check} exists.")
                else:
                    print(f"FAILED Teacher Admin: {check} missing.")
        except Exception as e:
            print(e)

        # 3. Student Dashboard Preview Mode Logic (Static Check)
        # We can try to load the student dashboard with preview params and see if it bypasses auth
        # Note: This requires the JS to execute.
        page.goto("http://localhost:8080/student-dashboard.html?preview=true&schoolId=test_school")

        # Wait for the student name to update to the mock name
        try:
            # "プレビュー生徒 (プレビュー)" should appear if JS runs correctly
            # We might need to wait a bit as it's async
            page.wait_for_selector("#student-name", timeout=5000)

            # Check content
            name_text = page.inner_text("#student-name")
            print(f"Student Preview Name: {name_text}")

            if "(プレビュー)" in name_text:
                print("Verified: Student Dashboard Preview Mode active.")
                page.screenshot(path="verification/preview_mode.png")
            else:
                print("FAILED: Student Dashboard did not enter Preview Mode.")

        except Exception as e:
            print(f"Preview check failed: {e}")

        browser.close()

if __name__ == "__main__":
    verify_portal_and_preview()
