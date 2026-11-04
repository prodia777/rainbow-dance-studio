Rainbow Dance Studio（Android版）　ビルドと配布の手順
=====================================================
バージョン 0.3.4（試作版）／アプリID: com.prodia.rainbowdancestudio

■ このフォルダの中身
  www/        … アプリの画面と解析の処理（今のWebアプリと同じ。フォントも同梱し、ネットなしで動きます）
  android/    … Androidアプリのプロジェクト（Android Studioで開く）
  node_modules/ … アプリの部品（消さないでください）
  .github/workflows/build-apk.yml … GitHubで自動ビルドする場合の設定
  server/dance/ … 自社サーバーに置くダウンロードページ（index.html、icon.png、.htaccess）

■ アプリでできること
  ・スマホに保存した曲を選んで解析 → 振付を自動で作成（PC版 自動振付 v0.7 と同じ計算）
  ・サンプル曲：ホルスト「惑星」より木星を同梱
  ・基板とBluetoothでつなぎ、振付を転送して、音楽と同時にスタート（基板プログラム v0.9 が必要）
  ・音を出す先のスイッチ（スマホのスピーカー／Bluetoothスピーカー）と、ずれの調整（標準150ms）
  ・PLAY／PAUSE／STOP、タイムラインをタップして途中から再生
  ・基板を試す（右・左に2秒）、基板の記録（接続、再起動の原因、転送、切断の時間）
  ・仮想Rainbow Stickで動きを確認、動きデータの書き出し（Documents/RainbowDanceStudio）

■ 動きデータの意味
  20msごとに1バイト：＋＝右回転、－＝左回転、0＝電気オフ（惰性で回る。ブレーキはかけない）
  値は基板のPWMの値そのもの。100%＝166、8の字の35%＝58が最大

■ 変更履歴
  0.3.4  仮想スティックの動きを実物に近く（広がりと、電気を切った時の落ち方）、絵を少し大きく
  0.3.3  曲の長さを再生時間の下に分母の形で表示
  0.3.2  音と動きのずれの確認画面、ずれ調整の範囲を±800msに、調整の内容を基板の記録に表示
  0.3.1  曲の長さを再生時間の横に表示、ダウンロードページの説明を改善
  0.3.0  自動振付 v0.7 を移植（PC版と全7曲で100%一致を確認）、基板とBluetooth接続、音を出す先のスイッチ、
         ずれの調整、基板の記録。演出4ボタンと調整画面は外した（お客様向けのボタンは後日）
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

■ 署名鍵について（重要・2026-11-04 GitHubのSecretsに登録済み）
  ・自社配布のアプリは、更新のたびに「同じ署名鍵」で作る必要があります。
  ・署名鍵をなくすと、お客様は一度アプリを削除しないと新しい版を入れられなくなります。
  ・「署名鍵_大切に保管」フォルダはバックアップを取り、他の人に渡さないでください。

■ iPhone版について
  iPhoneはアプリストア以外からのインストールに大きな制限があるため、別途検討します。
