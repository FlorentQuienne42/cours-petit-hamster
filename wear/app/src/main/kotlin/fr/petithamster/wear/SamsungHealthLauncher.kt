package fr.petithamster.wear

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

/**
 * Lancement d'une course dans Samsung Health (paquet com.samsung.android.wear.shealth).
 *
 * Samsung ne documente pas d'API publique permettant à une autre app de démarrer un exercice,
 * et encore moins d'y passer un objectif (distance, allure). On essaie donc plusieurs points
 * d'entrée, du plus précis au plus générique, et l'écran « Explorer » permet de tester chacun
 * directement sur la montre pour resserrer ensuite la cascade.
 */
object SamsungHealthLauncher {
    const val PACKAGE = "com.samsung.android.wear.shealth"

    // Intent standard « suivre une activité » de Google Fit, celui que Google Assistant émet
    // pour « démarrer une course » : action vnd.google.fitness.TRACK, type MIME
    // vnd.google.fitness.activity/<activité>, extra actionStatus = ActiveActionStatus.
    private const val ACTION_TRACK = "vnd.google.fitness.TRACK"
    private const val MIME_RUNNING = "vnd.google.fitness.activity/running"
    private const val EXTRA_STATUS = "actionStatus"
    private const val STATUS_ACTIVE = "ActiveActionStatus"

    // Identifiant « course à pied » dans la nomenclature des exercices Samsung Health.
    private const val SHEALTH_RUNNING = 1002

    /** Un point d'entrée candidat. [automatic] : essayé par le bouton principal. */
    class Attempt(val label: String, val intent: Intent?, val automatic: Boolean = true)

    /** Une activité exportée par Samsung Health, lançable par son composant. */
    class EntryPoint(val label: String, val component: ComponentName)

    sealed interface Result {
        data class Success(val strategy: String) : Result
        data class Failure(val reason: String) : Result
    }

    fun isInstalled(context: Context): Boolean = try {
        packageInfo(context, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    fun attempts(context: Context, goal: RunGoal): List<Attempt> {
        val track = Intent(ACTION_TRACK).apply {
            type = MIME_RUNNING
            putExtra(EXTRA_STATUS, STATUS_ACTIVE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        // Forme des liens profonds de l'app Samsung Health sur téléphone ; à confirmer sur la montre.
        val deepLink = Uri.parse("samsunghealth://shealth.samsung.com/deepLink").buildUpon()
            .appendQueryParameter("sc_id", "tracker.sport")
            .appendQueryParameter("action", "start")
            .appendQueryParameter("sport_type", SHEALTH_RUNNING.toString())
            .build()
        return listOf(
            Attempt("Intent Google Fit TRACK vers Samsung Health", Intent(track).setPackage(PACKAGE)),
            Attempt(
                "Lien profond samsunghealth://",
                Intent(Intent.ACTION_VIEW, deepLink).setPackage(PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            ),
            Attempt("Ouvrir Samsung Health", context.packageManager.getLaunchIntentForPackage(PACKAGE)),
            Attempt("Intent Google Fit TRACK, toute app de sport", Intent(track), automatic = false),
        )
    }

    fun resolves(context: Context, attempt: Attempt): Boolean =
        attempt.intent?.resolveActivity(context.packageManager) != null

    /** Cascade automatique : premier point d'entrée qui accepte le lancement. */
    fun startRun(context: Context, goal: RunGoal): Result {
        if (!isInstalled(context)) return Result.Failure("Samsung Health n'est pas installé sur cette montre.")
        for (attempt in attempts(context, goal).filter { it.automatic }) {
            val result = tryAttempt(context, attempt)
            if (result is Result.Success) return result
        }
        return Result.Failure("Aucun point d'entrée de Samsung Health n'a accepté le lancement.")
    }

    fun tryAttempt(context: Context, attempt: Attempt): Result {
        val intent = attempt.intent ?: return Result.Failure("${attempt.label} : intent indisponible")
        if (intent.resolveActivity(context.packageManager) == null) {
            return Result.Failure("${attempt.label} : aucune activité ne répond")
        }
        return try {
            context.startActivity(intent)
            Result.Success(attempt.label)
        } catch (e: ActivityNotFoundException) {
            Result.Failure("${attempt.label} : activité introuvable")
        } catch (e: SecurityException) {
            Result.Failure("${attempt.label} : accès refusé (activité non exportée)")
        }
    }

    /** Activités exportées par Samsung Health, pour exploration sur la montre. */
    fun exportedActivities(context: Context): List<EntryPoint> = try {
        packageInfo(context, PackageManager.GET_ACTIVITIES).activities.orEmpty()
            .filter { it.exported }
            .map { EntryPoint(it.name.removePrefix("$PACKAGE."), ComponentName(PACKAGE, it.name)) }
            .sortedBy { it.label }
    } catch (e: PackageManager.NameNotFoundException) {
        emptyList()
    }

    fun launch(context: Context, entry: EntryPoint): Result {
        val intent = Intent().setComponent(entry.component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return tryAttempt(context, Attempt(entry.label, intent))
    }

    private fun packageInfo(context: Context, flags: Int): PackageInfo =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(PACKAGE, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(PACKAGE, flags)
        }
}
