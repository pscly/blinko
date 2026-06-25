package com.blinko.app

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class QuickCaptureOverlayService : Service() {
    private val windowManager by lazy { getSystemService(WINDOW_SERVICE) as WindowManager }
    private var overlayView: View? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var noteInput: EditText? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (overlayView == null) {
            showOverlay()
        }
        focusInput()
        return START_STICKY
    }

    override fun onDestroy() {
        removeOverlay()
        super.onDestroy()
    }

    private fun showOverlay() {
        val root = createOverlayView()
        val params = createLayoutParams()
        overlayView = root
        layoutParams = params
        windowManager.addView(root, params)
    }

    private fun createOverlayView(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadius = dp(18).toFloat()
                setStroke(dp(1), Color.rgb(225, 229, 235))
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                elevation = dp(10).toFloat()
            }
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        header.addView(TextView(this).apply {
            text = getString(R.string.quick_capture_overlay_title)
            setTextColor(Color.rgb(17, 24, 39))
            textSize = 17f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        header.addView(Button(this).apply {
            text = getString(R.string.quick_capture_overlay_close)
            isAllCaps = false
            setOnClickListener { closeOverlay() }
        })
        header.setOnTouchListener(OverlayDragListener())
        root.addView(header)

        noteInput = EditText(this).apply {
            hint = getString(R.string.quick_capture_overlay_hint)
            minLines = 4
            maxLines = 8
            gravity = Gravity.TOP or Gravity.START
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            setSingleLine(false)
            setTextColor(Color.rgb(17, 24, 39))
            setHintTextColor(Color.rgb(107, 114, 128))
        }
        root.addView(noteInput, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(12)
        })

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
        }
        actions.addView(Button(this).apply {
            text = getString(R.string.quick_capture_overlay_cancel)
            isAllCaps = false
            setOnClickListener { closeOverlay() }
        })
        actions.addView(Button(this).apply {
            text = getString(R.string.quick_capture_overlay_submit)
            isAllCaps = false
            setOnClickListener { submitNote() }
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            leftMargin = dp(8)
        })
        root.addView(actions, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(10)
        })

        return root
    }

    private fun createLayoutParams(): WindowManager.LayoutParams {
        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        return WindowManager.LayoutParams(
            minOf(resources.displayMetrics.widthPixels - dp(32), dp(560)),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            x = 0
            y = dp(72)
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
        }
    }

    private fun submitNote() {
        val text = noteInput?.text?.toString()?.trim().orEmpty()
        if (text.isEmpty()) {
            Toast.makeText(this, R.string.quick_capture_overlay_empty_message, Toast.LENGTH_SHORT).show()
            return
        }

        getSharedPreferences(QuickCaptureOverlayBridge.PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(QuickCaptureOverlayBridge.PENDING_TEXT_KEY, text)
            .apply()

        startActivity(Intent(this, MainActivity::class.java).apply {
            action = QuickCaptureOverlayBridge.ACTION_SUBMIT
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        })
        closeOverlay()
    }

    private fun focusInput() {
        noteInput?.post {
            noteInput?.requestFocus()
            val inputManager = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            inputManager.showSoftInput(noteInput, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    private fun closeOverlay() {
        removeOverlay()
        stopSelf()
    }

    private fun removeOverlay() {
        overlayView?.let { windowManager.removeView(it) }
        overlayView = null
        layoutParams = null
        noteInput = null
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private inner class OverlayDragListener : View.OnTouchListener {
        private var startX = 0
        private var startY = 0
        private var touchX = 0f
        private var touchY = 0f

        override fun onTouch(view: View, event: MotionEvent): Boolean {
            val params = layoutParams ?: return false
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x
                    startY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = startX + (event.rawX - touchX).toInt()
                    params.y = startY + (event.rawY - touchY).toInt()
                    overlayView?.let { windowManager.updateViewLayout(it, params) }
                    return true
                }
                else -> return false
            }
        }
    }
}
