import os
from playwright.sync_api import sync_playwright

def verify_screenshare_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. Teacher View
        page = browser.new_page()
        url = f"file://{os.getcwd()}/screenshare.html?classId=test&mode=teacher"
        print(f"Checking Teacher View: {url}")
        page.goto(url)
        try:
            # Check for "Start Share" button
            btn = page.wait_for_selector("#btn-share", timeout=5000)
            if "画面共有を開始" in btn.inner_text():
                print("PASSED: Teacher UI has Share Button")
            else:
                print("FAILED: Teacher UI Share Button text mismatch")

            # Check for Permission toggle
            perm = page.wait_for_selector("#btn-perm")
            if "生徒の共有を許可" in perm.inner_text():
                print("PASSED: Teacher UI has Permission Toggle")

            page.screenshot(path="verification/screenshare_teacher.png")
        except Exception as e:
            print(f"FAILED: Teacher UI - {e}")
        page.close()

        # 2. Student View
        page = browser.new_page()
        url = f"file://{os.getcwd()}/screenshare.html?classId=test&mode=student"
        print(f"Checking Student View: {url}")
        page.goto(url)
        try:
            # Check for "Share" button (should be disabled)
            btn = page.wait_for_selector("#btn-student-share", timeout=5000)
            is_disabled = btn.is_disabled()
            if is_disabled:
                print("PASSED: Student Share button is disabled by default")
            else:
                print("FAILED: Student Share button is NOT disabled")

            page.screenshot(path="verification/screenshare_student.png")
        except Exception as e:
            print(f"FAILED: Student UI - {e}")
        page.close()

        browser.close()

if __name__ == "__main__":
    verify_screenshare_ui()
