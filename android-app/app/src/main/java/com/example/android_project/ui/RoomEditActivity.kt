package com.example.android_project.ui.room

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RoomRepository
import com.example.android_project.ui.BaseActivity
import com.example.android_project.util.ApiError
import kotlinx.coroutines.launch

/** 방 정보 수정(방장만): 방 만들기 화면을 그대로 쓰고, 현재 값을 채워서 보여준다. */
class RoomEditActivity : BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_NAME = "name"
        const val EXTRA_DESCRIPTION = "description"
        const val EXTRA_CAPACITY = "capacity"
        const val EXTRA_MEMBER_COUNT = "memberCount"
    }

    private lateinit var repo: RoomRepository
    private lateinit var etName: EditText
    private lateinit var etDescription: EditText
    private lateinit var etCapacity: EditText
    private lateinit var btnSave: Button
    private var roomId = 0
    private var memberCount = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_room_create)

        repo = RoomRepository(this)
        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        memberCount = intent.getIntExtra(EXTRA_MEMBER_COUNT, 1)

        etName = findViewById(R.id.etRoomName)
        etDescription = findViewById(R.id.etRoomDescription)
        etCapacity = findViewById(R.id.etCapacity)
        btnSave = findViewById(R.id.btnCreateRoom)

        // 만들기 화면의 문구를 수정용으로 바꾼다.
        findViewById<TextView>(R.id.tvScreenTitle).text = "방 정보 수정"
        findViewById<TextView>(R.id.tvIntroTitle).text = "방 정보를 바꿀 수 있어요"
        findViewById<TextView>(R.id.tvIntroSub).text = "이름, 소개, 최대 인원을 고쳐 보세요."
        findViewById<View>(R.id.cardInviteInfo).visibility = View.GONE
        findViewById<TextView>(R.id.tvTailHelper).text = "최대 인원은 현재 구성원 수(${memberCount}명)보다 작게 정할 수 없어요."
        btnSave.text = "저장"

        etName.setText(intent.getStringExtra(EXTRA_NAME).orEmpty())
        etDescription.setText(intent.getStringExtra(EXTRA_DESCRIPTION).orEmpty())
        etCapacity.setText(intent.getIntExtra(EXTRA_CAPACITY, 10).toString())

        bindCounter(etName, findViewById(R.id.tvNameCount), 20)
        bindCounter(etDescription, findViewById(R.id.tvDescCount), 100)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }
        btnSave.setOnClickListener { save() }
    }

    private fun bindCounter(edit: EditText, counter: TextView, max: Int) {
        counter.text = "${edit.text.length} / $max"
        edit.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                counter.text = "${s?.length ?: 0} / $max"
            }
        })
    }

    private fun save() {
        val name = etName.text.toString().trim()
        if (name.isEmpty()) {
            etName.error = "방 이름을 입력해 주세요."
            return
        }

        val capacityText = etCapacity.text.toString().trim()
        val capacity = capacityText.toIntOrNull()
        if (capacityText.isNotEmpty() && (capacity == null || capacity < 2 || capacity > 10)) {
            etCapacity.error = "최대 인원은 2명에서 10명 사이로 입력해 주세요."
            return
        }
        if (capacity != null && capacity < memberCount) {
            etCapacity.error = "현재 구성원 수(${memberCount}명)보다 작게 정할 수 없어요."
            return
        }

        btnSave.isEnabled = false
        lifecycleScope.launch {
            try {
                val response = repo.updateRoom(roomId, name, etDescription.text.toString().trim(), capacity)
                if (response != null && response.isSuccessful) {
                    com.example.android_project.util.Msg.makeText(this@RoomEditActivity, "방 정보를 저장했어요.", Toast.LENGTH_SHORT).show()
                    finish()
                } else if (response != null) {
                    com.example.android_project.util.Msg.makeText(this@RoomEditActivity, ApiError.messageOf(response, "저장하지 못했어요."), Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                com.example.android_project.util.Msg.makeText(this@RoomEditActivity, "서버에 연결할 수 없어요.", Toast.LENGTH_LONG).show()
            } finally {
                btnSave.isEnabled = true
            }
        }
    }
}
