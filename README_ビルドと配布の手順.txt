Rainbow Dance Studio（Android版・iPhone版・PC版）　ビルドと配布の手順
=====================================================
バージョン 0.4.0（試作版）／アプリID: com.prodia.rainbowdancestudio

■ このフォルダの中身
  www/        … アプリの画面と解析の処理（今のWebアプリと同じ。フォントも同梱し、ネットなしで動きます）
  android/    … Androidアプリのプロジェクト（Android Studioで開く）
  tools/build-pc-web.mjs … PC版（Web版）をサーバーに置く形で作る（build/pc-web/ にできる）
  ios/        … iPhoneアプリのプロジェクト（MacのXcodeで ios/App/App.xcodeproj を開く）
  node_modules/ … アプリの部品（消さないでください）
  .github/workflows/build-apk.yml … GitHubで自動ビルドする場合の設定（Android）
  .github/workflows/build-ios.yml … GitHubのMacでiPhone版のビルド確認（署名なし）
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
  0.4.0  （追記）PC版：横長の画面では振付の画面を左右2列に。MacのSafari・iPhoneで開いた時の案内。
         ダウンロードページにPC版の案内。基板プログラム v1.0（firmware/RS_Board_v10）を追加
  0.4.0  PC版（Web版：Chrome / Edge）を追加。PCではUSBケーブルとBluetoothの両方でつなげる、
         前回のつなぎ方で自動接続、MP3を画面に引っぱって入れる、スペースキーで再生／一時停止、
         書き出しはPCの「ダウンロード」フォルダへ。基板へ大きいまとまりで送れない時は小さくして送り直す。
         スマホのアプリの動きは変わらない（表示の言葉だけ「Bluetoothが切れました」などを共通化）
  0.3.5  最初の画面（タイトルの下）にバージョンを表示
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
   ※ www\index.html（最初の画面の「バージョン」表示）、package.json、server\dance\index.html の番号も同じにそろえます

■ 署名鍵について（重要・2026-11-04 GitHubのSecretsに登録済み）
  ・自社配布のアプリは、更新のたびに「同じ署名鍵」で作る必要があります。
  ・署名鍵をなくすと、お客様は一度アプリを削除しないと新しい版を入れられなくなります。
  ・「署名鍵_大切に保管」フォルダはバックアップを取り、他の人に渡さないでください。

■ iPhone版について
  iPhoneはアプリストア以外からのインストールに大きな制限があるため、別途検討します。

-----------------------------------------------------
iPhone版（2026-11-16 追加。Android版 0.3.5 と同じ中身）
-----------------------------------------------------
 ■ 今の状態
  ・ios/ フォルダにiPhoneアプリのプロジェクトを作成済み（Capacitor 8.5.3、iOS 15以上、iPhone専用）
  ・アプリの画面と解析（www/）はAndroid版と共通。www を直したら「npx cap sync ios」でiPhone版にも反映
  ・GitHubのMacで、署名なしのビルドが通ることを確認（Actions の「Build iOS (check)」）
  ・まだ実機では動かしていない（Mac・iPhone・Apple Developer Program が無いため）

 ■ iPhone版で違うところ
  ・曲の選び方：「ファイル」アプリ（このiPhone内・iCloud Drive・Googleドライブなど）に保存したMP3から選ぶ
    （「ミュージック」アプリのライブラリから選ぶ機能は、必要になったら追加。iPhone用の部品が別に必要）
  ・書き出し：「ファイル」アプリ → このiPhone内 → Rainbow Dance Studio → RainbowDanceStudio
  ・マナーモード（消音スイッチ）でも曲の音が出るように設定済み
  ・Androidの「戻る」ボタンに当たるものは無い（画面のボタンで戻る）
  ・Bluetooth：基板（BLE、名前 RainbowStick）にそのままつながる仕組み。初回に許可の確認が出る

 ■ 配布について
  ・日本ではiPhoneアプリを自社サーバーから直接インストールすることはできない
    → App Store で公開（テストは TestFlight）
  ・必要なもの：Apple Developer Program（年間99米ドル相当）。会社名で出すなら組織で登録（D-U-N-S番号）
  ・Macが無くても、GitHubのMacで署名してTestFlight／App Storeへ送る設定は作れる
    （登録後に、署名用の証明書などを GitHub の Secrets に登録する必要あり）

 ■ バージョンを変えるとき（iPhone版）
  ios/App/App.xcodeproj/project.pbxproj の MARKETING_VERSION（例 0.3.5）と CURRENT_PROJECT_VERSION（例 8）を
  Android版の versionName / versionCode とそろえる

-----------------------------------------------------
PC版（Web版）（2026-11-16 追加。バージョン 0.4.0）
-----------------------------------------------------
 ■ どんなものか
  ・ホームページに置き、お客様は Chrome または Edge でページを開くだけで使う（ダウンロード・インストール不要）
  ・サーバーのファイルを上書きすれば、お客様は次に開いた時から最新版を使える
  ・中身は www と同じ（解析・振付・再生・仮想スティック・ずれの調整・基板の記録）
  ・基板とのつなぎ方：「USBでつなぐ」（USBケーブル）／「Bluetoothでつなぐ」（PC内蔵のBluetooth）
    初回はブラウザの一覧から基板を選ぶ（USBは COMポート、Bluetoothは RainbowStick）。2回目からは前回のつなぎ方で自動接続
  ・使えないブラウザ：Firefox、Safari（基板につなげない。画面にその旨を表示）
  ・https のページでのみ動く（http で開いたら自動で https へ移る）

 ■ 作り方
  node tools/build-pc-web.mjs              → build/pc-web/dance-pc-test（テスト用。検索除け付き）
  node tools/build-pc-web.mjs --prod       → build/pc-web/dance-pc（本番用）
  ※ www を直したら、必ずバージョンを上げてから作る（ファイル名の後ろにバージョンを付けて、古いファイルが使われないようにしているため）

 ■ サーバーへの置き方
  1. まずテスト用：フォルダ「dance-pc-test」の中身を丸ごと https://rainbowstick777.com/dance-pc-test/ に置く
     （.htaccess も一緒に。ファイル名が「.」で始まるので、FTPソフトで隠しファイルを表示して確認）
  2. PCの Chrome / Edge で開いて確認
  3. 問題なければ、本番用「dance-pc」の中身を https://rainbowstick777.com/dance-pc/ に置く
  4. 更新する時も同じ：テスト用で確認 → 本番用を上書き

 ■ USBでつなぐ時の注意
  ・Arduino IDE のシリアルモニタなど、ほかの画面が基板のCOMポートを使っていると、つなげない
  ・USBでつないだ時に基板が再起動することがある（アプリは自動で待って聞き直す）
  ・USBドライバ：基板のUSBチップ（CH340 など）のドライバがPCに入っていること（Arduino IDE で書き込めるPCなら入っている）

-----------------------------------------------------
基板プログラム v1.0（2026-11-16）
-----------------------------------------------------
  firmware/RS_Board_v10/RS_Board_v10.ino
  ・v0.9 の「再生中に、曲の始まりより前の時刻へ位置を直されると止まる」不具合を修正
  ・命令は v0.9 と同じ。アプリはそのまま使える。返事は "READY v1.0 原因"
  ・書き込み：Arduino IDE、ツール → Partition Scheme → Huge APP（v0.9 と同じ）
