package fr.petithamster.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTheme(android.R.style.Theme_DeviceDefault)
        setContent { HamsterApp() }
    }
}

private enum class Screen { Home, Explorer }

@Composable
fun HamsterApp() {
    var screen by remember { mutableStateOf(Screen.Home) }
    MaterialTheme {
        when (screen) {
            Screen.Home -> HomeScreen(onExplore = { screen = Screen.Explorer })
            Screen.Explorer -> {
                BackHandler { screen = Screen.Home }
                ExplorerScreen(onBack = { screen = Screen.Home })
            }
        }
    }
}

private fun SamsungHealthLauncher.Result.message(): String = when (this) {
    is SamsungHealthLauncher.Result.Success -> "Lancé via : $strategy"
    is SamsungHealthLauncher.Result.Failure -> reason
}

/** Écran principal : un bouton qui lance la course, l'objectif en rappel, l'accès à l'explorateur. */
@Composable
fun HomeScreen(goal: RunGoal = RunGoal.DEFAULT, onExplore: () -> Unit) {
    val context = LocalContext.current
    var status by remember { mutableStateOf<String?>(null) }

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(text = "🐹 Petit hamster", style = MaterialTheme.typography.title3)
            Spacer(Modifier.height(10.dp))
            Chip(
                onClick = { status = SamsungHealthLauncher.startRun(context, goal).message() },
                label = { Text("Course ${goal.distanceLabel()}") },
                secondaryLabel = { Text("${goal.paceLabel()} · ${goal.timeLabel()}") },
                icon = { Text("▶") },
                colors = ChipDefaults.primaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = status ?: "Cible ${goal.distanceLabel()} à ${goal.paceLabel()} : à régler dans Samsung Health.",
                style = MaterialTheme.typography.caption2,
                textAlign = TextAlign.Center,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(8.dp))
            CompactChip(
                onClick = onExplore,
                label = { Text("Explorer Samsung Health") },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}

/** Écran de diagnostic : teste chaque stratégie et chaque activité exportée de Samsung Health. */
@Composable
fun ExplorerScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val listState = rememberScalingLazyListState()
    val installed = remember { SamsungHealthLauncher.isInstalled(context) }
    val attempts = remember { SamsungHealthLauncher.attempts(context, RunGoal.DEFAULT) }
    val activities = remember { SamsungHealthLauncher.exportedActivities(context) }
    var message by remember { mutableStateOf<String?>(null) }

    fun report(result: SamsungHealthLauncher.Result) {
        message = when (result) {
            is SamsungHealthLauncher.Result.Success -> "✓ ${result.strategy}"
            is SamsungHealthLauncher.Result.Failure -> "✗ ${result.reason}"
        }
    }

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) },
    ) {
        ScalingLazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 32.dp),
        ) {
            item { ListHeader { Text("Samsung Health") } }
            item {
                Text(
                    text = if (installed) "Installé sur la montre" else "Non installé sur la montre",
                    style = MaterialTheme.typography.caption1,
                    textAlign = TextAlign.Center,
                )
            }
            message?.let { m ->
                item {
                    Text(
                        text = m,
                        style = MaterialTheme.typography.caption2,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                }
            }
            item { ListHeader { Text("Stratégies") } }
            items(attempts) { attempt ->
                val ok = SamsungHealthLauncher.resolves(context, attempt)
                Chip(
                    onClick = { report(SamsungHealthLauncher.tryAttempt(context, attempt)) },
                    label = { Text(attempt.label, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                    secondaryLabel = { Text(if (ok) "répond" else "ne répond pas") },
                    colors = ChipDefaults.secondaryChipColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item { ListHeader { Text("Activités exportées (${activities.size})") } }
            items(activities) { entry ->
                Chip(
                    onClick = { report(SamsungHealthLauncher.launch(context, entry)) },
                    label = { Text(entry.label, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                    colors = ChipDefaults.secondaryChipColors(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                CompactChip(
                    onClick = onBack,
                    label = { Text("Retour") },
                    colors = ChipDefaults.primaryChipColors(),
                )
            }
        }
    }
}
