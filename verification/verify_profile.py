from playwright.sync_api import sync_playwright

def verify_student_profile_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate to Student Dashboard
        # It will redirect to login, but we can inspect the JS/HTML integrity
        page.goto("http://localhost:8080/student-dashboard.html")
        page.wait_for_load_state('networkidle')

        # We can't easily mock auth/data flow here without backend,
        # but we can verify that profile-setup.js is loaded and the logic exists.

        # Check if script is included
        is_script_loaded = page.evaluate("() => !!document.querySelector('script[src=\"js/profile-setup.js\"]')")
        print(f"Profile Setup Script Loaded: {is_script_loaded}")

        # Check if the modal container exists (it won't be in DOM until triggered, but we can check if function exists)
        # We manually trigger the modal function to verify UI rendering

        page.evaluate("""
            // Mock DB for the modal
            const mockDb = {
                collection: (name) => ({
                    where: () => ({
                        get: () => Promise.resolve([
                            { id: 'c1', data: () => ({ name: '1年A組', termType: 'current' }) },
                            { id: 'c2', data: () => ({ name: 'サッカー部', termType: 'indefinite' }) }
                        ])
                    })
                })
            };

            // Trigger global function if loaded
            if (window.showProfileModal) {
                window.showProfileModal(
                    { update: () => Promise.resolve() }, // mock doc ref
                    { name: 'テスト 太郎', kana: '', affiliations: [] }, // mock user data
                    mockDb
                );
            }
        """)

        # Wait for modal to appear
        try:
            page.wait_for_selector("#profile-setup-modal", timeout=5000)
            print("Modal appeared successfully via manual trigger.")

            # Screenshot the modal
            page.screenshot(path="verification/profile_modal.png")

            # Verify fields
            if page.is_visible("#setup-name") and page.is_visible("#setup-kana"):
                print("Name and Kana fields visible.")
            else:
                print("Missing fields.")

            # Verify Affiliation Row Addition
            page.click("#add-affiliation-btn")
            # Wait a bit for DOM update
            page.wait_for_timeout(500)
            page.screenshot(path="verification/profile_modal_added_row.png")
            print("Added affiliation row captured.")

        except Exception as e:
            print(f"Modal failed to appear: {e}")

        browser.close()

if __name__ == "__main__":
    verify_student_profile_flow()
