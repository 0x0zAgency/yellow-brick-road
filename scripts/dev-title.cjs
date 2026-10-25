'use strict';
/** Fixed, printable block lettering. No ANSI input or telemetry is embedded. */
const GLYPHS={
 Y:['#   #',' # # ','  #  ','  #  ','  #  '],E:['#####','#    ','#### ','#    ','#####'],L:['#    ','#    ','#    ','#    ','#####'],O:[' ### ','#   #','#   #','#   #',' ### '],W:['#   #','#   #','# # #','## ##','#   #'],
 B:['#### ','#   #','#### ','#   #','#### '],R:['#### ','#   #','#### ','#  # ','#   #'],I:['#####','  #  ','  #  ','  #  ','#####'],C:[' ####','#    ','#    ','#    ',' ####'],K:['#   #','#  # ','###  ','#  # ','#   #'],A:[' ### ','#   #','#####','#   #','#   #'],D:['#### ','#   #','#   #','#   #','#### '],
 ' ':['   ','   ','   ','   ','   ']
};
function blockTitle(text='YELLOW BRICK ROAD'){
 if(!/^[YEL OWBRICKAD]+$/.test(text))throw Error('Unsupported title glyph.');
 return Array.from({length:5},(_,row)=>[...text].map(c=>GLYPHS[c][row]).join(' ').trimEnd());
}
const COMPACT=['##   ## ######  ###### ', ' ## ##  ##   ## ##   ##', '  ###   ######  ###### ', '  ###   ######  ##   ##'];
module.exports={blockTitle,COMPACT};
