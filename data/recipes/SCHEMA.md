# 配方 JSON

助手只能寫這個資料夾裡的 `*.json`。不要改這個說明檔。

克數、`hydration`、`durationMin` 會被程式覆蓋。請寫百分比、總麵粉、目標含水，或下面兩個意圖欄位。

- `totalFlourG`：總麵粉克數。改它會等比縮放所有材料。
- `targetHydration`：目標含水率。水或牛奶裡 `balance: true` 的那一列會被算出來。
- `wholeWheatPercent`：全麥佔總麵粉的百分比。三成寫 `30`。寫完就會被拿掉。
- `scheduleRequest`：使用者說的出爐時間原話，例如 `明天晚上 7 點要出爐`。或直接寫 `schedule.anchorKind = "bake"` 與帶 `+08:00` 的 `anchor`。
- `baselineMin`：在 `baselineTempC`、`baselineLeaven` 下的步驟分鐘數。室溫與酵母／酸種的換算由程式做。
- 麵粉合計必須能補成 100。酵種麵粉算在裡面。
- 含水率含水、酵種的水、牛奶（87%）、蛋（75%）、奶油（16%）。油的水分是 0。

id 用小寫英數與連字號，並且要跟檔名一致。
