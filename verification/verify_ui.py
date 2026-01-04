from playwright.sync_api import sync_playwright

def verify_features():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("1. Verifying School Admin Page...")
        page.goto("http://localhost:8080/school-admin.html")

        # Mock Auth or Wait (The page might redirect to login if auth check fails)
        # Since I cannot easily mock Firebase Auth UI flow in headless without credentials,
        # I will inject a mock user state via console if possible or rely on the fact that I modified the HTML.
        # However, the JS auth check will kick me out.
        # Let's see if I can override the auth check or if I need to mock window.auth.

        # Actually, simpler: load the file directly and inject a script to bypass auth redirect?
        # Or just verify the DOM elements exist in the source, assuming the JS would render them if auth passed.
        # But the table is populated by JS.

        # Let's try to mock the `auth.onAuthStateChanged` or the user object.
        # I will use a special "preview" mode if I can, or just inject code before load.

        # Alternative: Just check if the Modal HTML is present in the DOM (it's static at the bottom).
        page.goto("http://localhost:8080/school-admin.html")

        # Check for Class Settings Modal
        modal = page.locator("#class-settings-modal")
        print(f"Modal found: {modal.count() > 0}")

        # Take screenshot of Admin (might be login page if redirected, but checking DOM presence of modal is key)
        # If redirected, we won't see it.
        # But the HTML is static.
        # Let's disable JS? No.

        # Let's check Whiteboard HTML instead, as it has the checkbox.
        print("2. Verifying Whiteboard Page...")
        page.goto("http://localhost:8080/whiteboard.html?classId=test&boardId=test&mode=teacher")

        # We need to click "Broadcast" settings to see the checkbox.
        # But first we need to pass Auth.
        # whiteboard.html redirects if no user.

        # Let's try to read the file content directly for verification in this specific env where Auth is hard to mock headless without a valid token.
        # Actually, I can use `page.set_content` with the HTML file content, bypassing the Auth check script?
        # But the script is inside.

        # Okay, I will just take a screenshot of the raw HTML rendering if possible, or reliance on code review.
        # But I must attempt verification.

        # Let's try to screenshot the Modal element specifically by forcing it visible via JS.
        page.goto("http://localhost:8080/whiteboard.html")

        # Force modal visible
        page.evaluate("document.getElementById('broadcast-modal').style.display = 'block'")
        page.screenshot(path="verification/whiteboard_modal.png")
        print("Screenshot taken: verification/whiteboard_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_features()
