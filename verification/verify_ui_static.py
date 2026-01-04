from playwright.sync_api import sync_playwright
import os

def verify_features():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify Whiteboard Force Project Checkbox
        print("Verifying Whiteboard HTML...")
        with open("whiteboard.html", "r") as f:
            content = f.read()

        # Remove the Auth script to prevent redirect
        # We'll just remove the firebase-init and auth scripts for visualization
        content_safe = content.replace('<script src="js/auth.js"></script>', '')
        content_safe = content_safe.replace('initTeacher(user);', '') # Prevent JS error if user undefined

        page.set_content(content_safe)

        # Force modal display
        try:
            page.evaluate("document.getElementById('broadcast-modal').style.display = 'block'")
            # Check for the checkbox
            checkbox = page.locator("#force-project-check")
            if checkbox.count() > 0:
                print("SUCCESS: Force Project checkbox found.")
            else:
                print("FAILURE: Force Project checkbox NOT found.")

            page.screenshot(path="verification/whiteboard_verified.png")
        except Exception as e:
            print(f"Error on whiteboard: {e}")

        # 2. Verify Admin Modal
        print("Verifying Admin HTML...")
        with open("school-admin.html", "r") as f:
            content = f.read()

        content_safe = content.replace('<script src="js/auth.js"></script>', '')
        page.set_content(content_safe)

        try:
            # Force modal display
            page.evaluate("document.getElementById('class-settings-modal').classList.remove('hidden')")

            # Check for input
            inp = page.locator("#settings-webhook")
            if inp.count() > 0:
                print("SUCCESS: Webhook Input found in Admin.")
            else:
                print("FAILURE: Webhook Input NOT found.")

            page.screenshot(path="verification/admin_verified.png")
        except Exception as e:
            print(f"Error on admin: {e}")

        browser.close()

if __name__ == "__main__":
    verify_features()
