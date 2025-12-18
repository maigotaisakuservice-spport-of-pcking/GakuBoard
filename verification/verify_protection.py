import os
from playwright.sync_api import sync_playwright

def verify_protection():
    # Pages that should redirect to login if not authenticated
    protected_pages = [
        "super-admin.html",
        "tenant-admin.html",
        "school-admin.html",
        "teacher-dashboard.html",
        "student-dashboard.html",
        "screenshare.html?classId=test&mode=teacher"
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. Verify Login Page loads
        page = browser.new_page()
        login_url = f"file://{os.getcwd()}/login.html"
        page.goto(login_url)
        try:
            page.wait_for_selector("h1", timeout=5000)
            if "GAKU-Board" in page.inner_text("h1"):
                print("PASSED: Login Page Loads")
            else:
                print("FAILED: Login Page Text Mismatch")
            page.screenshot(path="verification/screenshot_login.png")
        except Exception as e:
            print(f"FAILED: Login Page - {e}")
        page.close()

        # 2. Verify Protection (Redirect)
        for path in protected_pages:
            page = browser.new_page()
            url = f"file://{os.getcwd()}/{path}"
            print(f"Checking Protection for: {path}")

            try:
                page.goto(url)
                # Wait for navigation to login.html
                # Since we are using file://, it might just replace the content or change URL path.
                # In file:// protocol, redirecting to 'login.html' usually resolves to the full path.

                # We check if we are seeing the Login Page content
                page.wait_for_selector("#email", timeout=5000) # Email input from login.html

                print(f"PASSED: {path} redirected to Login")
            except Exception as e:
                print(f"FAILED: {path} did NOT redirect to Login properly - {e}")
                # Take screenshot to see what happened
                page.screenshot(path=f"verification/fail_protect_{path.split('?')[0]}.png")

            page.close()

        browser.close()

if __name__ == "__main__":
    verify_protection()
