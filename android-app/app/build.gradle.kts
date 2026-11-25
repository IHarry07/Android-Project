import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// 푸시 알림(FCM): app/google-services.json 이 있을 때만 켠다. 없으면 푸시 없이(15분마다 확인) 동작한다.
//   Firebase 콘솔에서 안드로이드 앱(com.example.android_project)을 등록하고 받은 파일을 app/ 폴더에 넣는다.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// 서버 주소는 android-app/local.properties 의 roomade.baseUrl 로 바꾼다.
// 없으면 에뮬레이터용 기본값(10.0.2.2)을 쓴다. 실제 폰에서는 PC의 내부 IP로 바꾼다.
//   예) 시연(PC 서버):  roomade.baseUrl=http://192.168.0.10:3000/
//       배포(HTTPS):   roomade.baseUrl=https://이름.duckdns.org/
// 주소가 https:// 이면 암호화되지 않은 HTTP 통신을 앱에서 아예 막는다.
val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val serverBaseUrl: String = (localProps.getProperty("roomade.baseUrl") ?: "http://10.0.2.2:3000/")
    .trim()
    .let { if (it.endsWith("/")) it else "$it/" }

android {
    namespace = "com.example.android_project"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.example.android_project"
        minSdk = 35
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "BASE_URL", "\"$serverBaseUrl\"")
        // HTTP 서버(시연용 PC)일 때만 평문 통신을 허용한다. (AndroidManifest 의 usesCleartextTraffic)
        manifestPlaceholders["usesCleartext"] = serverBaseUrl.startsWith("http://").toString()
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    // AuthInterceptor에서 OkHttp 4의 Kotlin 문법(response.code)을 쓰므로 버전을 명시한다.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.recyclerview:recyclerview:1.3.2")

    // 폰 알림창 알림: 앱이 꺼져 있어도 주기적으로 서버의 새 알림을 확인한다.
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation(platform("com.google.firebase:firebase-bom:35.2.0"))
    implementation("com.google.firebase:firebase-messaging")

    // QR 스캔 (Roomade-main에서 가져옴): 카메라 + ML Kit 바코드
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("androidx.camera:camera-core:1.4.2")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
}