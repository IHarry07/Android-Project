package com.example.android_project.data

import com.example.android_project.model.SignupRequest
import com.example.android_project.model.LoginRequest
import com.example.android_project.model.ResetPasswordRequest
import com.google.gson.JsonObject
import retrofit2.Response

class AuthRepository {

    // Retrofit API 연결
    private val apiService = RetrofitClient.apiService

    // 회원가입
    suspend fun signup(
        request: SignupRequest
    ): Response<JsonObject> {
        return apiService.signup(request)
    }

    // 로그인
    suspend fun login(
        request: LoginRequest
    ): Response<JsonObject> {
        return apiService.login(request)
    }

    // 비밀번호 찾기(이메일): 인증번호 보내기 / 확인하기
    suspend fun sendResetCode(loginId: String, email: String): Response<JsonObject> {
        val body = JsonObject().apply { addProperty("loginId", loginId); addProperty("email", email) }
        return apiService.sendResetCode(body)
    }

    suspend fun verifyResetCode(loginId: String, code: String): Response<JsonObject> {
        val body = JsonObject().apply { addProperty("loginId", loginId); addProperty("code", code) }
        return apiService.verifyResetCode(body)
    }

    // 비밀번호 찾기 2단계: 새 비밀번호
    suspend fun resetPassword(
        request: ResetPasswordRequest
    ): Response<JsonObject> {
        return apiService.resetPassword(request)
    }

    // 아이디 중복 확인
    suspend fun checkLoginId(
        loginId: String
    ): Response<JsonObject> {
        return apiService.checkLoginId(loginId)
    }

    // 닉네임 중복 확인
    suspend fun checkNickname(
        nickname: String
    ): Response<JsonObject> {
        return apiService.checkNickname(nickname)
    }
}
