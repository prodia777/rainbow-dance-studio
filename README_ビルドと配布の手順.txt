Rainbow Dance Studio（Android版）　ビルドと配布の手順
=====================================================
バージョン 0.2.0（試作版）／アプリID: com.prodia.rainbowdancestudio

■ このフォルダの中身
  www/        … アプリの画面と解析の処理（今のWebアプリと同じ。フォントも同梱し、ネットなしで動きます）
  android/    … Androidアプリのプロジェクト（Android Studioで開く）
  node_modules/ … アプリの部品（消さないでください）
  .github/workflows/build-apk.yml … GitHubで自動ビルドする場合の設定
  server/dance/ … 自社サーバーに置くダウンロードページ（index.html、icon.png、.htaccess）

■ アプリでできること（Webアプリと同じ）
  ・スマホに保存したMP3を選んで解析 → 振付を作成
  ・サンプル曲：ホルスト「惑星」より木星を同梱（ボタン1つで解析・再生）
  ・演出ボタン Relax／Standard／Dramatic／Powerful（再生中は変更できません）
  ・PLAY／PAUSE／STOP（再開は止めた位置から。基板へ位置つきの開始信号を送る）
  ・最近解析した曲をタップして、もう一度開ける
  ・仮想Rainbow Stickで動きを確認（反転の8の字、弾む、上で膨らむ形）
  ・調整、動きデータの書き出し（スマホの Documents/RainbowDanceStudio に保存）
  ・Androidの「戻る」ボタンで前の画面へ
  ・基板とのBluetooth接続の部品は組み込み済み（実際の接続処理は基板が届いてから作ります）

■ 動きデータの意味
  20msごとに1バイト：＋＝右回転、－＝左回転、0＝電気オフ（惰性で回る。ブレーキはかけない）

■ 変更履歴
  0.2.0  最新の画面（白い物理スイッチ風ボタン）と解析（弾む・刻む）、STOPボタン、履歴タップ、
         同梱サンプルをホルスト「木星」のみに
  0.1.0  最初の試作版

-----------------------------------------------------
方法A　PCのAndroid Studioで作る（Windowsで可）
-----------------------------------------------------
 1. Android Studio をインストール（https://developer.android.com/studio）
 2. このフォルダをPCの分かりやすい場所にコピー（日本語や空白のないパス推奨。例 C:\dev\RainbowDanceStudio）
 3. Android Studio で「Open」→ この中の android フォルダを選ぶ
 4. 初回は部品のダウンロードと準備（Gradle Sync）に数分〜十数分かかります
 5. テスト版を作る：メニュー Build → Build App Bundle(s) / APK(s) → Build APK(s)
      できたファイル：android\app\build\outputs\apk\debug\app-debug.apk
    ※ スマホをUSBでつなぎ（開発者向けオプションでUSBデバッグをON）、▶（Run）を押すと直接インストールして起動できます
 6. 正式版（お客様に配るもの）を作る：
      「署名鍵_大切に保管」フォルダの2つのファイル（rainbowdancestudio-release.jks、keystore.properties）を android フォルダにコピー
      メニュー Build → Build App Bundle(s) / APK(s) → Build APK(s) で release 版を選ぶ、
      または android フォルダでコマンド gradlew assembleRelease
      できたファイル：android\app\build\outputs\apk\release\app-release.apk

-----------------------------------------------------
方法B　GitHubで自動ビルド（PCへのインストール不要）
-----------------------------------------------------
 1. GitHubアカウントを作り、非公開リポジトリにこのフォルダ（node_modules以外）を置く
 2. 自動でAPKが作られ、Actions の画面からダウンロードできます
 3. 正式版にする場合は、リポジトリの Settings → Secrets に
      KEYSTORE_BASE64（署名鍵ファイルをBase64にした文字列）と KEYSTORE_PASSWORD を登録
 ※ この方法はClaudeが手伝えます（GitHubをClaudeに接続していただければ設定まで行えます）

-----------------------------------------------------
自社サーバーで配布（QRコードからダウンロード）
-----------------------------------------------------
 1. 正式版APKの名前を RainbowDanceStudio.apk に変更
 2. server\dance フォルダの中身（index.html、icon.png、.htaccess）と RainbowDanceStudio.apk を、
    さくらのレンタルサーバの rainbowstick777.com の下に新しく作る dance フォルダへアップロード
    （例：https://rainbowstick777.com/dance/ 。既存のファイルやフォルダには触れません）
 3. QRコード（QRコード_ダウンロードページ_案.png）を読み取ってページが開くか確認
 4. お客様のスマホでは、初回だけ「この提供元のアプリを許可」が必要です（ページに手順を記載済み）
 ※ アップデートするときは、同じ署名鍵で作った新しいAPKに差し替え、versionCode を1つ上げます
   （android\app\build.gradle の versionCode / versionName）

■ 署名鍵について（重要）
  ・自社配布のアプリは、更新のたびに「同じ署名鍵」で作る必要があります。
  ・署名鍵をなくすと、お客様は一度アプリを削除しないと新しい版を入れられなくなります。
  ・「署名鍵_大切に保管」フォルダはバックアップを取り、他の人に渡さないでください。

■ iPhone版について
  iPhoneはアプリストア以外からのインストールに大きな制限があるため、別途検討します。
