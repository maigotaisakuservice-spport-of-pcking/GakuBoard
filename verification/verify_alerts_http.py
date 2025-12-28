from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Access via HTTP server
        page.goto("http://localhost:8000/school-admin.html")

        # Inject Mock Logic
        page.evaluate("""
            document.getElementById('content-manage').classList.add('hidden');
            document.getElementById('content-alerts').classList.remove('hidden');

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

        page.screenshot(path="verification/school_alerts_http.png")
        browser.close()

if __name__ == "__main__":
    verify_frontend()
