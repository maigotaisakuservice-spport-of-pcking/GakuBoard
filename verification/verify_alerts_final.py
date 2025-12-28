from playwright.sync_api import sync_playwright
import re

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Read file
        with open("school-admin.html", "r") as f:
            content = f.read()

        # Nuke all JS that might redirect
        content = content.replace('<script src="js/auth.js"></script>', '')
        content = content.replace('<script src="js/admin-utils.js"></script>', '')
        content = content.replace('<script src="js/firebase-init.js"></script>', '')
        content = content.replace('auth.onAuthStateChanged', 'if(false)')

        with open("verification/temp_admin_clean.html", "w") as f:
            f.write(content)

        page.goto("http://localhost:8000/verification/temp_admin_clean.html")

        # Now inject logic
        page.evaluate("""
            // Mock switchTab
            window.switchTab = function(tabId) {
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

        page.screenshot(path="verification/school_alerts_final.png")
        browser.close()

if __name__ == "__main__":
    verify_frontend()
