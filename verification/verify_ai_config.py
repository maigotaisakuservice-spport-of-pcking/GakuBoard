from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Read file
        with open("super-admin.html", "r") as f:
            content = f.read()

        # Nuke all JS that might redirect
        content = content.replace('<script src="js/auth.js"></script>', '')
        content = content.replace('<script src="js/admin-utils.js"></script>', '')
        content = content.replace('<script src="js/firebase-init.js"></script>', '')
        content = content.replace('auth.onAuthStateChanged', 'if(false)')

        with open("verification/temp_super_admin.html", "w") as f:
            f.write(content)

        page.goto("http://localhost:8000/verification/temp_super_admin.html")

        # Inject logic to open modal
        page.evaluate("""
            const modal = document.getElementById('ai-modal');
            modal.classList.remove('hidden');
            document.getElementById('ai-modal-title').textContent = "AI設定: テストテナント";
            document.getElementById('ai-enabled').checked = true;
            document.getElementById('ai-api-key').value = "AIzaSyTestKey";
        """)

        page.screenshot(path="verification/ai_config_modal.png")
        browser.close()

if __name__ == "__main__":
    verify_frontend()
