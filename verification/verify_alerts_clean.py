from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Access via HTTP server
        page.goto("http://localhost:8000/school-admin.html")

        # Wait for page load (which might redirect to login because of auth check)
        # We need to stop the redirect or handle it.
        # Since auth.onAuthStateChanged runs immediately, it might redirect to login.html.

        # Let's try to mock the auth check or just load the HTML without JS if possible?
        # No, we need JS to execute our injection.

        # If it redirects to login.html, we are manipulating login.html.
        # Let's see where we are.
        print(page.url)

        # If we are at login.html, we can't test school-admin.html UI easily without mocking auth properly.
        # BUT, the redirect happens in `auth.onAuthStateChanged`.
        # If we disable JS? No.

        # We can route intercept the auth.js loading?

        # Actually, let's just create a temporary HTML file that HAS the content but NO auth check.
        # This is the most reliable way to verify the STATIC structure we added.

        import shutil
        shutil.copy("school-admin.html", "verification/temp_admin.html")

        # Remove auth.js script tag from temp file?
        with open("verification/temp_admin.html", "r") as f:
            content = f.read()

        content = content.replace('<script src="js/auth.js"></script>', '<!-- <script src="js/auth.js"></script> -->')
        content = content.replace('<script src="js/admin-utils.js"></script>', '')

        with open("verification/temp_admin.html", "w") as f:
            f.write(content)

        page.goto("http://localhost:8000/verification/temp_admin.html")

        # Now inject logic
        page.evaluate("""
            // Mock switchTab
            function switchTab(tabId) {
                ['manage', 'portal', 'alerts'].forEach(t => {
                    const el = document.getElementById(`content-${t}`);
                    if(el) el.classList.add('hidden');
                    const btn = document.getElementById(`tab-${t}`);
                    if(btn) {
                        btn.classList.remove('bg-white', 'text-green-700', 'font-bold', 'border-t', 'border-l', 'border-r', 'rounded-t');
                        btn.classList.add('bg-gray-200', 'text-gray-600');
                    }
                });
                const content = document.getElementById(`content-${tabId}`);
                if(content) content.classList.remove('hidden');

                const activeBtn = document.getElementById(`tab-${tabId}`);
                if(activeBtn) {
                    activeBtn.classList.remove('bg-gray-200', 'text-gray-600');
                    activeBtn.classList.add('bg-white', 'text-green-700', 'font-bold', 'border-t', 'border-l', 'border-r', 'rounded-t');
                }
            }

            switchTab('alerts');

            const list = document.getElementById('alert-list');
            list.innerHTML = `
                <tr class="border-b bg-red-100">
                    <td class="p-3">1年A組</td>
                    <td class="p-3 font-bold">田中 太郎</td>
                    <td class="p-3 text-red-600 font-bold">38.2℃</td>
                    <td class="p-3 text-xl">😫</td>
                    <td class="p-3 text-gray-600">頭が痛い</td>
                    <td class="p-3"><span class="bg-red-600 text-white px-2 py-1 rounded text-xs">通知あり</span></td>
                    <td class="p-3 text-xs text-gray-400">08:30</td>
                </tr>
                <tr class="border-b bg-white">
                    <td class="p-3">1年B組</td>
                    <td class="p-3 font-bold">佐藤 花子</td>
                    <td class="p-3 text-red-600 font-bold">37.6℃</td>
                    <td class="p-3 text-xl">😐</td>
                    <td class="p-3 text-gray-600">少し熱っぽい</td>
                    <td class="p-3"><span class="bg-yellow-500 text-white px-2 py-1 rounded text-xs">要注意</span></td>
                    <td class="p-3 text-xs text-gray-400">08:35</td>
                </tr>
            `;
        """)

        page.screenshot(path="verification/school_alerts_clean.png")
        browser.close()

if __name__ == "__main__":
    verify_frontend()
