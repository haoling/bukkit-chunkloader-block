var slash = require('slash');
var utils = require('utils');
require("utils/sprintf");
require("utils/string-exts");

var SECOND = 1000;
var POLLING_INTERVAL = 60 * SECOND; // this is probably precise enough 
var ADD_COUNT_PER_ITEM = 180;

var load = function () {
  var ret = scload("scriptcraft/data/chunkloader.json");
  if (ret == undefined || ret == null) ret = new Object();
  if (ret.list == undefined) ret.list = new Object();
  return ret;
};

var save = function(store) {
  scsave(store, "scriptcraft/data/chunkloader.json");
};

var countToTimeStr = function (count) {
  var time = (count * POLLING_INTERVAL) / SECOND;
  var seconds = time % 60;
  var minutes = Math.floor(time / 60) % 60;
  var hours = Math.floor(time / (60 * 60));

  var ret = "約";
  if (hours > 0) {
    ret += hours + "時間";
    ret += ("00" + minutes).slice(-2) + "分";
  } else if (minutes > 0) {
    ret += minutes + "分";
    ret += ("00" + seconds).slice(-2) + "秒";
  } else {
    ret += seconds + "秒";
  }
  return ret;
};

events.blockPlace(function (event) {
  if (event.itemInHand.getType() != Packages.org.bukkit.Material.BRICK) return;
  if (! event.itemInHand.getItemMeta().getDisplayName()) return;
  if (event.itemInHand.getItemMeta().getDisplayName().indexOf("チャンクローダー") == -1) return;

  var loc = event.block.getLocation();
  var store = load();
  store.list[loc.toString()] = {
    active:false,
    location: {
      world: loc.getWorld().getName(),
      x: loc.getX(),
      y: loc.getY(),
      z: loc.getZ(),
    },
    author: event.player.getDisplayName(),
  };
  save(store);

  Java.type("me.fromgate.playeffect.PlayEffect").set(
    "REDSTONE",
    "id:chunkloader:%s,%s,%s,%s loc:%s,%s,%s,%s offsetY:0.5".sprintf(
      loc.getWorld().getName(),
      loc.getX(),
      loc.getY() + 1,
      loc.getZ(),
      loc.getWorld().getName(),
      loc.getX(),
      loc.getY() + 1,
      loc.getZ()
    )
  )
});

events.playerInteract(function (event) {
  if (event.getAction() != Packages.org.bukkit.event.block.Action.RIGHT_CLICK_BLOCK) return;
  if (event.getClickedBlock().getType() != Packages.org.bukkit.Material.BRICK) return;

  var loc = event.getClickedBlock().getLocation();
  var store = load();
  if (store.list[loc.toString()] == undefined) return;
  var loader = store.list[loc.toString()];

  event.setCancelled(true);

  var itemStack = event.getItem();
  if (itemStack == null || itemStack.getType() != Packages.org.bukkit.Material.EMERALD) {
    alert(event.player, "チャンクローダーを稼働するにはエメラルドが必要です！".gray());
    if (loader.active) {
      var eTime = countToTimeStr(loader.count);
      alert(event.player, ("チャンクローダーは稼働中です。残り時間:" + eTime).gold());
    }
    return;
  }

  var loc2;
  for (var i = 1; i <= 2; i++) {
    loc2 = new Packages.org.bukkit.Location(loc.getWorld(), loc.getX(), loc.getY() + i, loc.getZ());
    if (loc2.getBlock().getType() != Packages.org.bukkit.Material.AIR) {
      alert(event.player, "チャンクローダーを稼働するには上部に2ブロックの空間が必要です！".gray());
      return;
    }
  }

  if (loader.active) {
    loader.count += ADD_COUNT_PER_ITEM;
    save(store);
    var eTime = countToTimeStr(loader.count);
    alert(event.player, ("チャンクローダーの稼働時間を延長しました。残り時間:" + eTime).gold());
    return;
  }

  loader.active = true;
  loader.count = ADD_COUNT_PER_ITEM;
  save(store);

  var npcName = "チャンクローダー/%s,%d,%d,%d".sprintf(
    loader.location.world,
    loader.location.x,
    loader.location.y,
    loader.location.z
  );
  slash("npc remove " + npcName, server.getConsoleSender());
  slash(
    "npc create %s --at %s:%s:%s:%s --type PLAYER".sprintf(
      npcName,
      parseInt(loader.location.x, 10) + 0.5,
      parseInt(loader.location.y, 10) + 1,
      parseInt(loader.location.z, 10) + 0.5,
      loader.location.world
    ),
    server.getConsoleSender()
  );
  slash("npc lookclose", server.getConsoleSender());
  slash("npc playerlist", server.getConsoleSender());
  var eTime = countToTimeStr(loader.count);
  alert(event.player, ("チャンクローダーを稼働しました。残り時間:" + eTime).gold());
});

events.blockBreak(function (event) {
  //console.log(event.block);
  if (event.block.getType() != Packages.org.bukkit.Material.BRICK) return;

  var loc = event.block.getLocation();
  //console.log(loc.toString());
  var store = load();
  if (store.list[loc.toString()] == undefined) return;
  var loader = store.list[loc.toString()];

  event.setCancelled(true);
  event.block.setType(Packages.org.bukkit.Material.AIR);
  var item = new Packages.org.bukkit.inventory.ItemStack(Packages.org.bukkit.Material.BRICK);
  var itemMeta = item.getItemMeta();
  itemMeta.setDisplayName("チャンクローダー".gold());
  item.setItemMeta(itemMeta);
  event.block.getWorld().dropItemNaturally(loc, item);

  var effectLoc = new Packages.org.bukkit.Location(loc.getWorld(), loc.getX(), loc.getY() + 1, loc.getZ());
  var Effects = Java.type("me.fromgate.playeffect.Effects");
  var effectId;
  while ((effectId = Effects.getEffectInLocation(effectLoc)) != -1) {
    Effects.removeStaticEffect(effectId);
  }

  var npcName = "チャンクローダー/%s,%d,%d,%d".sprintf(
    loader.location.world,
    loader.location.x,
    loader.location.y,
    loader.location.z
  );
  slash("npc remove " + npcName, server.getConsoleSender());

  delete store.list[loc.toString()];
  save(store);
});


setInterval(function () {
  var store = load();
  var dirty = false;
  for (var loc in store.list) {
    if (! store.list[loc].active) continue;
    var loader = store.list[loc];
    loader.count--;
    dirty = true;
    if (loader.count < 0) {
      loader.active = false;
      var npcName = "チャンクローダー/%s,%d,%d,%d".sprintf(
        loader.location.world,
        loader.location.x,
        loader.location.y,
        loader.location.z
      );
      slash("npc remove " + npcName, server.getConsoleSender());
      console.log("chunkloader:" + loc + " is deactivated.");
    }
  }
  if (dirty) {
    save(store);
  }
}, POLLING_INTERVAL);

