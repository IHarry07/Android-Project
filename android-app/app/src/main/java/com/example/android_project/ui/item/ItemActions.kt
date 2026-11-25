package com.example.android_project.ui.item

import android.content.Intent
import android.text.InputType
import com.google.gson.JsonObject
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.android_project.data.ItemRepository
import com.example.android_project.model.Item
import com.example.android_project.util.ApiError
import kotlinx.coroutines.launch

// 물품을 눌렀을 때 나오는 메뉴 (수량 조정 / 삭제)
object ItemActions {

    fun show(
        activity: AppCompatActivity,
        repo: ItemRepository,
        roomId: Int,
        item: Item,
        onChanged: () -> Unit
    ) {
        val toggleLabel =
            if (item.ownershipType == "SHARED") "내 것으로 바꾸기" else "공용으로 바꾸기"

        com.google.android.material.dialog.MaterialAlertDialogBuilder(activity)
            .setTitle(item.name)
            .setItems(arrayOf("수정", "수량 조정", toggleLabel, "삭제")) { _, which ->
                when (which) {
                    0 -> edit(activity, roomId, item)
                    1 -> askDelta(activity, repo, roomId, item, onChanged)
                    2 -> toggleOwnership(activity, repo, roomId, item, onChanged)
                    else -> confirmDelete(activity, repo, roomId, item, onChanged)
                }
            }
            .show()
    }

    // 다른 구성원의 개인 물품: 내용만 보여준다. 고치거나 지우는 것은 등록한 사람만 할 수 있다.
    fun showReadOnly(activity: AppCompatActivity, item: Item) {
        val lines = mutableListOf<String>()
        lines.add("${item.ownerNickname ?: "구성원"}님의 개인 물품이에요.")
        lines.add("")
        lines.add("수량: ${item.quantityText()}")
        item.expiryDate?.let { lines.add("유통기한: ${it.take(10)}") }
        item.storageLocation?.takeIf { it.isNotBlank() }?.let { lines.add("보관 위치: $it") }
        lines.add("")
        lines.add("등록한 사람만 수정하거나 삭제할 수 있어요.")

        com.google.android.material.dialog.MaterialAlertDialogBuilder(activity)
            .setTitle(item.name)
            .setMessage(lines.joinToString("\n"))
            .setPositiveButton("확인", null)
            .show()
    }

    // 이름·수량·유통기한·보관 위치 수정 화면. 저장하고 돌아오면 목록 화면이 다시 불러온다.
    private fun edit(activity: AppCompatActivity, roomId: Int, item: Item) {
        activity.startActivity(
            Intent(activity, ItemFormActivity::class.java)
                .putExtra(ItemFormActivity.EXTRA_ROOM_ID, roomId)
                .putExtra(ItemFormActivity.EXTRA_OWNERSHIP, item.ownershipType)
                .putExtra(ItemFormActivity.EXTRA_CATEGORY, item.category)
                .putExtra(ItemFormActivity.EXTRA_ITEM_ID, item.itemId)
                .putExtra(ItemFormActivity.EXTRA_NAME, item.name)
                .putExtra(ItemFormActivity.EXTRA_QUANTITY, item.quantity)
                .putExtra(ItemFormActivity.EXTRA_UNIT, item.unit)
                .putExtra(ItemFormActivity.EXTRA_EXPIRY, item.expiryDate?.take(10))
                .putExtra(ItemFormActivity.EXTRA_LOCATION, item.storageLocation)
        )
    }

    private fun toggleOwnership(
        activity: AppCompatActivity,
        repo: ItemRepository,
        roomId: Int,
        item: Item,
        onChanged: () -> Unit
    ) {
        val target = if (item.ownershipType == "SHARED") "PERSONAL" else "SHARED"
        val changes = JsonObject().apply { addProperty("ownershipType", target) }
        run(activity, onChanged) { repo.update(roomId, item.itemId, changes) }
    }

    private fun askDelta(
        activity: AppCompatActivity,
        repo: ItemRepository,
        roomId: Int,
        item: Item,
        onChanged: () -> Unit
    ) {
        val input = EditText(activity).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or
                InputType.TYPE_NUMBER_FLAG_DECIMAL or
                InputType.TYPE_NUMBER_FLAG_SIGNED
            hint = "예: -1 (줄이기), 3 (늘리기)"
            setPadding(60, 40, 60, 20)
        }

        com.google.android.material.dialog.MaterialAlertDialogBuilder(activity)
            .setTitle("${item.name} 수량 조정")
            .setMessage("지금 ${item.quantityText()}  ·  늘리면 +, 줄이면 - 로 입력해 주세요.")
            .setView(input)
            .setPositiveButton("확인") { _, _ ->
                val delta = input.text.toString().trim().toDoubleOrNull()
                if (delta == null || delta == 0.0) {
                    com.example.android_project.util.Msg.makeText(activity, "0이 아닌 숫자를 입력해 주세요.", Toast.LENGTH_SHORT).show()
                } else {
                    run(activity, onChanged) { repo.adjust(roomId, item.itemId, delta) }
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun confirmDelete(
        activity: AppCompatActivity,
        repo: ItemRepository,
        roomId: Int,
        item: Item,
        onChanged: () -> Unit
    ) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(activity)
            .setMessage("'${item.name}'을(를) 삭제할까요?")
            .setPositiveButton("삭제") { _, _ ->
                run(activity, onChanged) { repo.delete(roomId, item.itemId) }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun run(
        activity: AppCompatActivity,
        onChanged: () -> Unit,
        request: suspend () -> retrofit2.Response<*>?
    ) {
        activity.lifecycleScope.launch {
            try {
                val response = request()
                when {
                    response == null ->
                        com.example.android_project.util.Msg.makeText(activity, "로그인이 필요합니다.", Toast.LENGTH_SHORT).show()
                    response.isSuccessful -> onChanged()
                    else -> com.example.android_project.util.Msg.makeText(
                        activity,
                        ApiError.messageOf(response, "요청에 실패했습니다."),
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                com.example.android_project.util.Msg.makeText(activity, "서버에 연결할 수 없습니다.\n(${e.message})", Toast.LENGTH_LONG).show()
            }
        }
    }
}
