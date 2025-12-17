from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Absolute path to file
    cwd = os.getcwd()

    # 1. Check Screen Share Page
    page.goto(f"file://{cwd}/screenshare.html?room=test&role=teacher")
    page.screenshot(path="verification/screenshare_teacher.png", full_page=True)

    page.goto(f"file://{cwd}/screenshare.html?room=test&role=student")
    page.screenshot(path="verification/screenshare_student.png", full_page=True)

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
