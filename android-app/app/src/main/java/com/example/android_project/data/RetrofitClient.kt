package com.example.android_project.data

import android.content.Context
import com.example.android_project.BuildConfig
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private lateinit var appContext: Context

    // App.onCreate()에서 한 번 호출한다.
    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            // 쉬는 연결은 30초 뒤 버린다. 서버는 65초까지 열어 두므로, 서버가 먼저 닫은 연결을 다시 쓰다가
            // 첫 요청이 실패하는 일이 없다. 연결이 끊겨 실패하면 한 번 더 시도한다.
            .connectionPool(ConnectionPool(5, 30, TimeUnit.SECONDS))
            .retryOnConnectionFailure(true)
            .addInterceptor(AuthInterceptor(appContext))
            .build()
    }

    // 서버 주소는 android-app/local.properties 의 roomade.baseUrl 로 정한다. (app/build.gradle.kts 참고)
    val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    // 로그인 및 회원가입 API
    val apiService: ApiService by lazy {
        retrofit.create(ApiService::class.java)
    }

    // 방 관리 API
    val roomApiService: RoomApiService by lazy {
        retrofit.create(RoomApiService::class.java)
    }

    // 알림 API
    val inquiryApiService: InquiryApiService by lazy {
        retrofit.create(InquiryApiService::class.java)
    }

    val noticeApiService: NoticeApiService by lazy {
        retrofit.create(NoticeApiService::class.java)
    }

    val memoApiService: MemoApiService by lazy {
        retrofit.create(MemoApiService::class.java)
    }

    val searchApiService: SearchApiService by lazy {
        retrofit.create(SearchApiService::class.java)
    }

    val expenseApiService: ExpenseApiService by lazy {
        retrofit.create(ExpenseApiService::class.java)
    }

    val notificationApiService: NotificationApiService by lazy {
        retrofit.create(NotificationApiService::class.java)
    }

    // 내 정보(프로필) API
    val userApiService: UserApiService by lazy {
        retrofit.create(UserApiService::class.java)
    }

    // 일정(캘린더) API
    val scheduleApiService: ScheduleApiService by lazy {
        retrofit.create(ScheduleApiService::class.java)
    }

    // 창고(물품) API
    val itemApiService: ItemApiService by lazy {
        retrofit.create(ItemApiService::class.java)
    }
}
