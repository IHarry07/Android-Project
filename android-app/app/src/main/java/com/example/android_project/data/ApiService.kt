package com.example.android_project.data

import com.example.android_project.model.SignupRequest
import com.example.android_project.model.LoginRequest
import com.example.android_project.model.ResetPasswordRequest

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
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


    // 이메일 인증번호 받기 (가입, 이메일 변경). 로그인한 상태면 Authorization 을 같이 보낸다.
    @POST("api/auth/email/send")
    suspend fun sendEmailCode(
        @Header("Authorization") token: String?,
        @Body body: JsonObject
    ): Response<JsonObject>


    // 이메일 인증번호 확인 ({"emailToken": "...", "expiresInSeconds": 1800})
    @POST("api/auth/email/verify")
    suspend fun verifyEmailCode(
        @Body body: JsonObject
    ): Response<JsonObject>


    // 로그아웃: 이 로그인을 서버에서 바로 무효화한다.
    @POST("api/auth/logout")
    suspend fun logout(
        @Header("Authorization") token: String
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
