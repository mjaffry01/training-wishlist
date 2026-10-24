# Training Wish List

A public board where people enter their name and what they want from the training.
Everyone can see everyone's wishes. No login needed.

- **Database:** a Google Sheet
- **API:** Google Apps Script (`apps-script/Code.gs`), deployed as a public Web App
- **Website:** `index.html`, hosted free on GitHub Pages

**Live board:** https://mjaffry01.github.io/training-wishlist/
The site is already connected. The steps below are for setting it up again from scratch.

## 1. Create the Google Sheet + script (about 5 minutes)

1. Go to <https://sheets.new> and name the sheet, e.g. **Training Wish List**.
2. Open **Extensions → Apps Script**.
3. Delete what's in `Code.gs` and paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs). Save.
4. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Click **Deploy**, then **Authorize access** and allow it with your Google account.
     (If Google shows "Google hasn't verified this app", click **Advanced → Go to … (unsafe)**. It's your own script, so this is expected.)
5. Copy the **Web app URL**. It ends in `/exec`.

The script makes a `Wishes` tab the first time someone submits. You can watch entries arrive there.

## 2. Connect the website

Open `index.html` and replace the placeholder near the bottom:

```js
const API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
```

with your `/exec` URL. Until you do this the page shows a "not connected" notice and saving is turned off.

## 3. Host it on GitHub Pages

1. Create a new public repository on GitHub, e.g. `training-wishlist`.
2. Upload `index.html` (the `apps-script` folder and this README are optional).
3. In the repo go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
4. After a minute your board is live at `https://<your-username>.github.io/training-wishlist/`. Share that link.

Or from a terminal inside this folder:

```bash
git init && git add . && git commit -m "Training wish list" && git branch -M main
```

```bash
gh repo create training-wishlist --public --source . --push
```

Then turn on Pages as in step 3.

## How it works

- People type their name and one wish per line, then press **Save**.
- Saving again with the **same name** updates that person's list instead of adding a duplicate. The **Edit this list** button on a card fills the form for you.
- The board refreshes itself every 30 seconds and has a search box.

## Changing the script later

If you edit `Code.gs`, go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
That keeps the same URL, so you don't need to change `index.html`.

## Good to know

- Because there's no login, anyone with the link can add or change any list (including someone else's, by typing their name). That's fine for a small trusted group. You can always fix or delete rows directly in the Google Sheet.
- Text is escaped before it's shown, and values that would act as spreadsheet formulas are stored as plain text.
