const route = {
  harbour:{action:'點亮未來',kind:'願景示意',symbol:'✦',stages:[['today','今日'],['cooperate','協作'],['future','未來']],cue:'望向維港，展開五年考察旅程。兩側星光大道與文化中心為海濱背景景觀。'},
  classroom:{action:'小組學習',kind:'課室願景',symbol:'◉',stages:[['collaborate','平板'],['explore','VR探索'],['share','討論分享']],cue:'先看同學操作平板、輪流討論和機械人協助，再按「體驗VR」一起走進太空。數字教育措施屬公布計劃，這個課室是教學願景。'},
  polyu:{action:'啟動採樣',kind:'理大成果 · 模擬',symbol:'☾',stages:[['surface','表取採樣'],['packing','封裝'],['transfer','運送'],['analyse','檢驗分析']],cue:'先看月面模型採樣、封裝和轉移，再觀察研究人員及機械人檢驗樣本。香港理工大學研發採樣器、近攝相機及初級封裝系統，2024年嫦娥六號成果屬已有基礎；實驗室、機械人與分析畫面為教學模擬。'},
  community:{action:'探索四區醫療協作',kind:'香港醫療 · 教學模擬',symbol:'✚',stages:[['screening','健康檢查'],['education','健康講座'],['ward','住院照護'],['herbal_lab','中藥檢測'],['evidence','證據審查'],['registration','中藥成分分析'],['trial','醫患溝通'],['medical_school','器官模型打印'],['clinical_exam','臨床檢查']],cue:'四區將預防、治療、監管、研究與人才連起來。機構並非現實共址，醫療數據及操作均為教學模擬。科大醫學院預計2028／29首屆入學；此處展示2030學習願景。'},
  kwai:{action:'跟隨貨物出發',kind:'海空聯運 · 模擬',symbol:'▣',stages:[['receive','收貨'],['screen','監管與安檢'],['pallet','打板'],['agv','無人車'],['sea','保安船運'],['land','香港機場降落'],['unload','空側轉運'],['uplift','裝貨上機']],cue:'東莞完成航空安檢、打板及航空公司收貨，保安船運直達香港機場空側。飛機只在香港機場區域降落。海關與航空安檢分開展示，機械人協作為教學願景。'},
  lamma:{action:'啟動智慧耕作',kind:'智慧農業 · 模擬',symbol:'✦',stages:[['till','翻土起壟'],['seed','播種'],['irrigate','自動淋水'],['fertilise','精準施肥'],['soil','土壤採樣'],['analyse','化驗'],['weather','氣象預警'],['recycle','循環用水']],cue:'跟隨一粒種子探索科技耕作。2030年全國糧食綜合生產能力目標約1.45萬億斤。拖拉機帶動旋耕刀翻起泥土，留下犁溝後播種，旋轉噴頭自動淋水，無人機按模擬需肥量定點施肥，跨越田間空隙時停止噴灑；採樣機反覆掘取泥土、封存樣本並送到實驗室，再返回採樣點。土壤、天氣數據及機械人協作為教學模擬。'},
  culture:{action:'導覽西九文化區',kind:'教學重現 · 公布計劃',symbol:'◇',stages:[['palace','故宮'],['freespace','自由空間'],['artpark','草地與街頭表演'],['mplus','M+ 當代藝術館'],['performing','演藝中心'],['xiqu','戲曲中心']],cue:'依地政總署地圖觀察岸線及設施位置關係。2027至28年度超過1000項活動、約40萬名觀眾，是文化區整體目標。自由空間依實景相片修整；草地可見街頭唱歌、結他、舞蹈、市民和周演森學生野餐，以及Tripo小狗、小貓。'},
  museum:{action:'參觀六個展區',kind:'古洞北 · 概念設計',symbol:'◇',stages:[['history','歷史'],['technology','科技'],['sports','體育'],['heritage','文化'],['hk_role','香港角色'],['two_systems','一國兩制']],cue:'博物館籌劃中，開館日期待定。建築、園區、展品及策展安排為教學概念，並非官方核准設計。'}
};
export function presentationFor(id){return Object.hasOwn(route,id)?route[id]:route.harbour;}


