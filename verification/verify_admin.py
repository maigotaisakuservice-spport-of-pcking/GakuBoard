from playwright.sync_api import sync_playwright

def verify_super_admin():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to Super Admin page
        # Note: It will redirect to login.html because not authenticated
        page.goto("http://localhost:8080/super-admin.html")

        # Wait for redirect
        page.wait_for_load_state('networkidle')

        # Check if we are on login page
        print(f"Current URL: {page.url}")

        # Now let's try to mock the auth state to see the actual page structure
        # We reload the page and inject a script before it loads

        page.route("**/*", lambda route: route.continue_())

        # We can't easily mock Firebase Auth state from outside without complex injection.
        # But we can inspect the HTML file content to see if the structure is correct?
        # Or we can just take a screenshot of the login page which proves the server is running
        # and the redirect logic (auth guard) is working.

        page.screenshot(path="verification/super_admin_redirect.png")

        # Let's try to verify the existence of specific elements in the HTML source code
        # by fetching it directly (ignoring execution)
        import requests
        resp = requests.get("http://localhost:8080/super-admin.html")
        content = resp.text

        if "新規テナント作成" in content and "テナント管理者作成 (同時作成)" in content:
            print("Verified: Super Admin HTML contains new fields.")
        else:
            print("Failed: Super Admin HTML missing new fields.")

        browser.close()

if __name__ == "__main__":
    verify_super_admin()
