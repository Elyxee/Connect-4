// Export one label as scalable glyph outlines, without shipping a system font.
// clang -fobjc-arc -framework Foundation -framework CoreText -framework CoreGraphics
//   scripts/home-label-path.m -o /tmp/home-label-path
#import <Foundation/Foundation.h>
#import <CoreText/CoreText.h>
#import <CoreGraphics/CoreGraphics.h>

static void outputPath(void *info, const CGPathElement *e) {
  switch (e->type) {
    case kCGPathElementMoveToPoint:
      printf("M%.3f %.3f",e->points[0].x,e->points[0].y); break;
    case kCGPathElementAddLineToPoint:
      printf("L%.3f %.3f",e->points[0].x,e->points[0].y); break;
    case kCGPathElementAddQuadCurveToPoint:
      printf("Q%.3f %.3f %.3f %.3f",e->points[0].x,e->points[0].y,e->points[1].x,e->points[1].y); break;
    case kCGPathElementAddCurveToPoint:
      printf("C%.3f %.3f %.3f %.3f %.3f %.3f",e->points[0].x,e->points[0].y,e->points[1].x,e->points[1].y,e->points[2].x,e->points[2].y); break;
    case kCGPathElementCloseSubpath: printf("Z"); break;
  }
}
int main(int argc,char **argv) { @autoreleasepool {
  if(argc!=6)return 1;
  NSString *text=[NSString stringWithUTF8String:argv[1]];
  CTFontRef font=CTFontCreateWithName(CFSTR("AvenirNext-Heavy"),100,NULL);
  NSAttributedString *label=[[NSAttributedString alloc] initWithString:text attributes:@{(__bridge NSString *)kCTFontAttributeName:(__bridge id)font}];
  CTLineRef line=CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)label);
  CGMutablePathRef whole=CGPathCreateMutable();
  for(id item in (__bridge NSArray *)CTLineGetGlyphRuns(line)) {
    CTRunRef run=(__bridge CTRunRef)item; CFIndex count=CTRunGetGlyphCount(run);
    CGGlyph glyphs[count];CGPoint positions[count];
    CTRunGetGlyphs(run,CFRangeMake(0,0),glyphs);CTRunGetPositions(run,CFRangeMake(0,0),positions);
    for(CFIndex i=0;i<count;i++) {
      CGPathRef p=CTFontCreatePathForGlyph(font,glyphs[i],NULL);
      CGAffineTransform t=CGAffineTransformMakeTranslation(positions[i].x,positions[i].y);
      if(p){CGPathAddPath(whole,&t,p);CGPathRelease(p);}
    }
  }
  CGRect b=CGPathGetPathBoundingBox(whole);
  double x=atof(argv[2]),y=atof(argv[3]),w=atof(argv[4]),h=atof(argv[5]);
  CGAffineTransform t=CGAffineTransformMake(w/b.size.width,0,0,-h/b.size.height,x-b.origin.x*w/b.size.width,y+h+b.origin.y*h/b.size.height);
  CGPathRef result=CGPathCreateCopyByTransformingPath(whole,&t);
  CGPathApply(result,NULL,outputPath);
  CGPathRelease(result);CGPathRelease(whole);CFRelease(line);CFRelease(font);
} return 0;}
