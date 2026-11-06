package dev.minemories.fabric.mixin;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(TextureAtlasSprite.class)
public interface SpriteImageAccess {
  @Accessor("mainImage")
  NativeImage[] minemories$images();
}
