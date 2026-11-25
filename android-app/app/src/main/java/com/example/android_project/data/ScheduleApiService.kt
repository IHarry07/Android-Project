package com.example.android_project.data

import com.example.android_project.model.CleaningActionRequest
import com.example.android_project.model.CreateScheduleRequest
import com.example.android_project.model.PostponeCleaningRequest
import com.example.android_project.model.ReassignCleaningRequest
import com.example.android_project.model.SaveCleaningSettingsRequest
import com.google.gson.JsonObject
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface ScheduleApiService {

    // 알림 시간처럼 null(알림 없음)도 그대로 보내야 하는 일정 추가
    @POST("api/rooms/{roomId}/schedules")
    suspend fun createScheduleRaw(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body body: RequestBody
    ): Response<JsonObject>

    // 기간(from~to, yyyy-MM-dd)과 겹치는 일정 ({"schedules": [...]})
    @GET("api/rooms/{roomId}/schedules")
    suspend fun listSchedules(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("from") from: String,
        @Query("to") to: String
    ): Response<JsonObject>

    @POST("api/rooms/{roomId}/schedules")
    suspend fun createSchedule(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body request: CreateScheduleRequest
    ): Response<JsonObject>

    // 작성자나 방장만 수정할 수 있다. 내용을 지우려면(null) 직접 만든 JSON을 보내야 해서 RequestBody로 받는다.
    @PATCH("api/rooms/{roomId}/schedules/{scheduleId}")
    suspend fun updateSchedule(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("scheduleId") scheduleId: Int,
        @Body body: RequestBody
    ): Response<JsonObject>

    // 청소당번 설정 조회 ({"settings": {...}})
    @GET("api/rooms/{roomId}/cleaning-settings")
    suspend fun getCleaningSettings(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int
    ): Response<JsonObject>

    // 청소당번 설정을 한 번에 저장 (방 구성원 누구나)
    @PUT("api/rooms/{roomId}/cleaning-settings")
    suspend fun saveCleaningSettings(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Body request: SaveCleaningSettingsRequest
    ): Response<JsonObject>

    // 청소 완료·건너뛰기·미루기 (응답: {"task": {...}} 다음 예정일·담당자가 반영된 항목)
    @POST("api/rooms/{roomId}/cleaning-tasks/{taskId}/complete")
    suspend fun completeCleaning(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("taskId") taskId: Int,
        @Body request: CleaningActionRequest
    ): Response<JsonObject>

    @POST("api/rooms/{roomId}/cleaning-tasks/{taskId}/skip")
    suspend fun skipCleaning(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("taskId") taskId: Int,
        @Body request: CleaningActionRequest
    ): Response<JsonObject>

    @POST("api/rooms/{roomId}/cleaning-tasks/{taskId}/postpone")
    suspend fun postponeCleaning(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("taskId") taskId: Int,
        @Body request: PostponeCleaningRequest
    ): Response<JsonObject>

    // 담당자 바꾸기 (방 구성원 누구나). 이번 회차만 대신(ONCE) 또는 앞으로 계속(ALWAYS)
    @POST("api/rooms/{roomId}/cleaning-tasks/{taskId}/reassign")
    suspend fun reassignCleaning(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("taskId") taskId: Int,
        @Body request: ReassignCleaningRequest
    ): Response<JsonObject>

    // 청소 이력 ({"events": [...]}): 완료·건너뜀·미룸·담당자 변경. taskId를 주면 그 청소만, 없으면 방 전체
    @GET("api/rooms/{roomId}/cleaning-history")
    suspend fun listCleaningHistory(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("taskId") taskId: Int?,
        @Query("limit") limit: Int
    ): Response<JsonObject>

    // 청소 이력 ({"records": [...]}). 최근 것부터
    @GET("api/rooms/{roomId}/cleaning-tasks/{taskId}/records")
    suspend fun listCleaningRecords(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("taskId") taskId: Int,
        @Query("limit") limit: Int
    ): Response<JsonObject>

    // 청소 당번 목록 ({"tasks": [...]}). 진행 중인 것만
    @GET("api/rooms/{roomId}/cleaning-tasks")
    suspend fun listCleaningTasks(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Query("active") active: String
    ): Response<JsonObject>

    @DELETE("api/rooms/{roomId}/schedules/{scheduleId}")
    suspend fun deleteSchedule(
        @Header("Authorization") token: String,
        @Path("roomId") roomId: Int,
        @Path("scheduleId") scheduleId: Int
    ): Response<Void>
}
