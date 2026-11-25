package com.example.android_project.data

import com.example.android_project.model.SignupRequest
import com.example.android_project.model.LoginRequest
import com.example.android_project.model.ResetPasswordRequest
import com.example.android_project.model.VerifyIdentityRequest

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {

    // 회원가입
    @POST("api/auth/signup")
    suspend fun signup(
        @Body request: SignupRequest
    ): Response<JsonObject>


    // 로그인
    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<JsonObject>


    // 비밀번호 찾기 1단계: 가입 정보 확인 ({"resetToken": "...", "expiresInSeconds": 600})
    @POST("api/auth/reset-password/verify")
    suspend fun verifyIdentity(
        @Body request: VerifyIdentityRequest
    ): Response<JsonObject>


    // 비밀번호 찾기(이메일) 1단계: 아이디와 이메일로 인증번호 받기 ({"message", "expiresInSeconds"})
    @POST("api/auth/reset-password/email/send")
    suspend fun sendResetCode(
        @Body body: JsonObject
    ): Response<JsonObject>


    // 비밀번호 찾기(이메일) 2단계: 인증번호 확인 ({"resetToken": "...", "expiresInSeconds": 600})
    @POST("api/auth/reset-password/email/verify")
    suspend fun verifyResetCode(
        @Body body: JsonObject
    ): Response<JsonObject>


    // 비밀번호 찾기 2단계: 확인 토큰으로 새 비밀번호 정하기. 로그인하지 않은 상태에서 쓴다.
    @POST("api/auth/reset-password")
    suspend fun resetPassword(
        @Body request: ResetPasswordRequest
    ): Response<JsonObject>


    // 아이디 중복 확인
    @GET("api/auth/check-login-id")
    suspend fun checkLoginId(
        @Query("loginId") loginId: String
    ): Response<JsonObject>


    // 닉네임 중복 확인
    @GET("api/auth/check-nickname")
    suspend fun checkNickname(
        @Query("nickname") nickname: String
    ): Response<JsonObject>

}
