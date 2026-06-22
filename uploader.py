import os
import requests
from config import API_KEY, BASE_URL

INPUT_DIR = "patents_5"

HEADERS = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
}

# ---------- 1. read txt ----------
def read_txt(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

# ---------- 2. post API ----------
def upload(text, corpus="patentrag"):
    url = f"{BASE_URL}/process"

    payload = {
        "type": "text",
        "url": text
    }

    r = requests.post(url, headers=HEADERS, json=payload)

    if r.status_code != 200:
        print("❌ Upload failed:", r.status_code, r.text)
        return False

    return True

# ---------- 3. main ----------
def main():
    files = sorted(os.listdir(INPUT_DIR))

    success_count = 0
    fail_count = 0

    for i, file in enumerate(files):
        if not file.endswith(".txt"):
            continue

        path = os.path.join(INPUT_DIR, file)

        try:
            print(f"\n[{i+1}/{len(files)}] Processing: {file}")

            text = read_txt(path)

            if not text.strip():
                print("⚠ Empty file, skipped")
                continue

            ok = upload(text)

            if ok:
                print("✅ Uploaded:", file)
                success_count += 1
            else:
                print("❌ Failed:", file)
                fail_count += 1

        except Exception as e:
            print("❌ Error:", file, str(e))
            fail_count += 1

    print("\n===== DONE =====")
    print("Success:", success_count)
    print("Failed:", fail_count)

if __name__ == "__main__":
    main()
