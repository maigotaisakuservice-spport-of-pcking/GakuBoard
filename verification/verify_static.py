from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Absolute path to file
    cwd = os.getcwd()

    # 1. Check Admin Page
    page.goto(f"file://{cwd}/admin.html")
    page.screenshot(path="verification/admin_page.png", full_page=True)

    # 2. Check Login Pages
    page.goto(f"file://{cwd}/student-login.html")
    page.screenshot(path="verification/student_login.png", full_page=True)

    page.goto(f"file://{cwd}/teacher-login.html")
    page.screenshot(path="verification/teacher_login.png", full_page=True)

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
