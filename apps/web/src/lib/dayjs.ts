import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";
import localizedFormat from "dayjs/plugin/localizedFormat";

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(localizedFormat);
// Locale stays at dayjs's default (en) — the UI chrome is English (#378), so
// .fromNow() must match ("2 hours ago", not "2시간 전").

export default dayjs;
