package com.example.android_project.ui.room

import android.os.Bundle
import android.widget.Button
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast

import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope

import com.example.android_project.R
import com.example.android_project.data.RoomRepository
import com.example.android_project.util.ApiError

import kotlinx.coroutines.launch

class RoomCreateActivity : com.example.android_project.ui.BaseActivity() {

    private lateinit var roomRepository: RoomRepository

    private lateinit var etRoomName: EditText
    private lateinit var etRoomDescription: EditText
    private lateinit var etCapacity: EditText
    private lateinit var btnCreateRoom: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_room_create)

        roomRepository = RoomRepository(this)

        etRoomName = findViewById(R.id.etRoomName)
        etRoomDescription = findViewById(R.id.etRoomDescription)
        etCapacity = findViewById(R.id.etCapacity)
        btnCreateRoom = findViewById(R.id.btnCreateRoom)

        btnCreateRoom.setOnClickListener {
            createRoom()
        }

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        // 글자 수 표시
        bindCounter(etRoomName, findViewById(R.id.tvNameCount), 20)
        bindCounter(etRoomDescription, findViewById(R.id.tvDescCount), 100)
    }

    private fun bindCounter(edit: EditText, counter: TextView, max: Int) {
        edit.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                counter.text = "${s?.length ?: 0} / $max"
            }
        })
    }

    // 방 생성
    private fun createRoom() {

        val roomName = etRoomName.text.toString().trim()
        val description = etRoomDescription.text.toString().trim().ifEmpty { null }

        if (roomName.isEmpty()) {
            etRoomName.error = "방 이름을 입력해 주세요."
            return
        }

        // 최대 인원은 선택. 비우면 서버 기본값(10명)을 쓴다.
        val capacityText = etCapacity.text.toString().trim()
        val capacity = capacityText.toIntOrNull()
        if (capacityText.isNotEmpty() && (capacity == null || capacity < 2 || capacity > 10)) {
            etCapacity.error = "최대 인원은 2명에서 10명 사이로 입력해 주세요."
            return
        }

        // 버튼 중복 클릭 방지
        btnCreateRoom.isEnabled = false

        lifecycleScope.launch {

            try {

                val response = roomRepository.createRoom(roomName, description, capacity)

                if (response == null) {
                    com.example.android_project.util.Msg.makeText(
                        this@RoomCreateActivity,
                        "로그인이 필요합니다.",
                        Toast.LENGTH_SHORT
                    ).show()
                    return@launch
                }

                if (response.isSuccessful) {

                    // 초대 코드는 지금만 볼 수 있으므로 꼭 보여준다.
                    val code = response.body()
                        ?.getAsJsonObject("invite")
                        ?.get("code")
                        ?.takeIf { it.isJsonPrimitive }
                        ?.asString

                    showInviteCode(code)

                } else {
                    com.example.android_project.util.Msg.makeText(
                        this@RoomCreateActivity,
                        ApiError.messageOf(response, "방 생성 실패"),
                        Toast.LENGTH_LONG
                    ).show()
                }

            } catch (e: Exception) {

                com.example.android_project.util.Msg.makeText(
                    this@RoomCreateActivity,
                    "오류 발생: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()

            } finally {
                btnCreateRoom.isEnabled = true
            }
        }
    }

    // 초대 코드 안내. 닫으면 방 목록으로 돌아간다.
    private fun showInviteCode(code: String?) {

        if (code == null) {
            com.example.android_project.util.Msg.makeText(this, "방이 생성되었습니다.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        RoomInviteCodeDialog.show(this, "방이 만들어졌어요", code) { finish() }
    }
}
