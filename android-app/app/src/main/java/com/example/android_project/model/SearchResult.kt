package com.example.android_project.model

// type: FOOD(음식) / SUPPLY(물품) / SCHEDULE(일정) / CLEANING(청소)
data class SearchResult(
    val type: String,
    val id: Int,
    val title: String,
    val line1: String? = null,
    val line2: String? = null
) {
    fun typeLabel(): String = when (type) {
        "FOOD" -> "음식"
        "SUPPLY" -> "물품"
        "CLEANING" -> "청소"
        else -> "일정"
    }
}

data class SearchCounts(
    val all: Int = 0,
    val food: Int = 0,
    val supply: Int = 0,
    val schedule: Int = 0
)