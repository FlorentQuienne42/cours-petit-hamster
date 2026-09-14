package fr.petithamster.wear

/** Objectif de la séance : distance en mètres et allure cible en secondes par kilomètre. */
data class RunGoal(val distanceMeters: Int, val paceSecPerKm: Int) {

    /** Temps visé en secondes (distance × allure). */
    val targetSeconds: Int
        get() = distanceMeters * paceSecPerKm / 1000

    fun distanceLabel(): String = when {
        distanceMeters % 1000 == 0 -> "${distanceMeters / 1000} km"
        distanceMeters >= 1000 -> "%.1f km".format(distanceMeters / 1000.0).replace('.', ',')
        else -> "$distanceMeters m"
    }

    fun paceLabel(): String = "%d:%02d/km".format(paceSecPerKm / 60, paceSecPerKm % 60)

    fun timeLabel(): String {
        val h = targetSeconds / 3600
        val m = targetSeconds % 3600 / 60
        val s = targetSeconds % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    companion object {
        /** 2 km à 6:00/km, soit 12:00. */
        val DEFAULT = RunGoal(distanceMeters = 2000, paceSecPerKm = 360)
    }
}
