package org.uclvolunteering.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Draw under the status and navigation bars; the site pads itself with
        // env(safe-area-inset-*), and @capacitor-community/safe-area pads the
        // web view instead on the older WebViews that report those as 0.
        EdgeToEdge.enable(this);
    }
}
