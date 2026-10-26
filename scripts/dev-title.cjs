'use strict';
/** Creator-supplied artwork, reconstructed at its original 72-column line width.
 * Fixed source only: never pass terminal input or telemetry through this path.
 * Keep block/shade glyphs intact; all dynamic display values remain sanitized.
 */
const FRAMED_YBR=Object.freeze([
 "         ███             ███             ███             ███            ",
 "       ███░            ███░            ███░            ███░            █",
 "     ███░            ███░            ███░            ███░            ███",
 "   ███░            ███░            ███░            ███░            ███░ ",
 " ███░            ███░            ███░            ███░            ███░   ",
 "██░            ███░            ███░            ███░            ███░     ",
 "░            ███░            ███░            ███░            ███░       ",
 "            ░░░             ░░░             ░░░             ░░░         ",
 "     ██.----------------.  .----------------.  .----------------.    ███",
 "   ███| .--------------. || .--------------. || .--------------. | ███░ ",
 " ███░ | |  ____  ____  | || |   ______     | || |  _______     | |██░   ",
 "██░   | | |_  _||_  _| | || |  |_   _ \\    | || | |_   __ \\    | |░     ",
 "░     | |   \\ \\  / /   | || |    | |_) |   | || |   | |__) |   | |      ",
 "      | |    \\ \\/ /    | || |    |  __'.   | || |   |  __ /    | |      ",
 "      | |    _|  |_    | || |   _| |__) |  | || |  _| |  \\ \\_  | |      ",
 "      | |   |______|   | || |  |_______/   | || | |____| |___| | |      ",
 " ███  | |              | || |              | || |              | |██    ",
 "██░   | '--------------' || '--------------' || '--------------' |░     ",
 "░      '----------------'  '----------------'██'----------------'       ",
 "           ███░            ███░            ███░            ███░         ",
 "         ███░            ███░            ███░            ███░           ",
 "       ███░            ███░            ███░            ███░            █",
 "     ███░            ███░            ███░            ███░            ███",
 "    ░░░             ░░░             ░░░             ░░░             ░░░ ",
 "             ███             ███             ███             ███        ",
 "           ███░            ███░            ███░            ███░         ",
 "         ███░            ███░            ███░            ███░           "
]);
const FRAMED_YBR_WIDTH=72;
// The framed letters retain the original side ornament when height is limited.
const FRAMED_YBR_COMPACT=Object.freeze(FRAMED_YBR.slice(8,19));
const COMPACT=Object.freeze(['##   ## ######  ###### ', ' ## ##  ##   ## ##   ##', '  ###   ######  ###### ', '  ###   ######  ##   ##']);
module.exports={FRAMED_YBR,FRAMED_YBR_WIDTH,FRAMED_YBR_COMPACT,COMPACT};
