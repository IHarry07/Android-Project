package com.example.android_project.data

import com.example.android_project.model.ChangeAccountRequest
import com.example.android_project.model.ChangePasswordRequest
import com.example.android_project.model.UpdateMeRequest
import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.DELETE
import retrofit2.http.HTTP
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Streaming
import retrofit2.http.PATCH

interface UserApiService {

    // 내 정보 ({"user": {...}})
    @GET("api/users/me")
    suspend fun getMe(
        @Header("Authorization") token: String
    ): Response<JsonObject>

    // 이름·닉네임·전화번호 수정 ({"user": {...}})
    @PATCH("api/users/me")
    suspend fun updateMe(
        @Header("Authorization") token: String,
        @Body request: UpdateMeRequest
    ): Response<JsonObject>

    // 비밀번호 변경. 이전 토큰이 모두 무효가 되므로 응답의 새 token을 저장해야 한다.
    @PATCH("api/users/me/password")
    suspend fun changePassword(
        @Header("Authorization") token: String,
        @Body request: ChangePasswordRequest
    ): Response<JsonObject>

    // 계좌 변경 (현재 비밀번호 확인 필요)
    @PATCH("api/users/me/account")
    suspend fun changeAccount(
        @Header("Authorization") token: String,
        @Body request: ChangeAccountRequest
    ): Response<JsonObject>

    // 회원 탈퇴: 비밀번호 확인, 방에 속해 있다면 sharedItems(TRANSFER/DELETE)
    @HTTP(method = "DELETE", path = "api/users/me", hasBody = true)
    suspend fun withdraw(
        @Header("Authorization") token: String,
        @Body body: JsonObject
    ): Response<JsonObject>

    // 프로필 사진 올리기: 정사각형으로 줄인 JPEG를 본문 그대로 보낸다. ({"user": {...}})
    @PUT("api/users/me/photo")
    suspend fun uploadPhoto(
        @Header("Authorization") token: String,
        @Body body: RequestBody
    ): Response<JsonObject>

    @DELETE("api/users/me/photo")
    suspend fun deletePhoto(
        @Header("Authorization") token: String
    ): Response<JsonObject>

    // 같은 방 구성원에게 프로필 사진을 보일지 ({"photoPublic": true})
    @PATCH("api/users/me/photo-visibility")
    suspend fun setPhotoVisibility(
        @Header("Authorization") token: String,
        @Body body: JsonObject
    ): Response<JsonObject>

    // 프로필 사진 이미지 (본인이거나, 상대가 공개했고 같은 방일 때만)
    @Streaming
    @GET("api/users/{userId}/photo")
    suspend fun photo(
        @Header("Authorization") token: String,
        @Path("userId") userId: Int
    ): Response<ResponseBody>}
